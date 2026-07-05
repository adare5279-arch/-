// KMS(경기도의회 전자회의록) → meeting_statements 일괄 임포트
//
// 회의 본문(mntsViewer.do?mntsId=ID)을 받아 발언자별로 묶고 규칙기반 요약을
// 생성해 Supabase meeting_statements 에 채운다. 회의 단위로 멱등(기존 행 삭제 후
// 재삽입)하게 동작한다.
//
// 사용법:
//   node scripts/import_mnts.mjs                # 발언 없는 회의 전부
//   node scripts/import_mnts.mjs --force        # 이미 있는 회의도 다시
//   node scripts/import_mnts.mjs --limit 20
//   node scripts/import_mnts.mjs --committee 경제노동위원회
//   node scripts/import_mnts.mjs --meeting 14449
//   node scripts/import_mnts.mjs --dry          # DB 쓰기 없이 파싱만 확인
//
// 비밀키는 .env.local 의 SUPABASE_SERVICE_ROLE_KEY 를 읽어 쓰기에만 사용한다.

import { readFileSync } from "node:fs";

// ---- env ----
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}
const ENV = loadEnv();
const SUPA_URL =
  ENV.NEXT_PUBLIC_SUPABASE_URL || "https://mrfcwyfpkreicemwxhrv.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZmN3eWZwa3JlaWNlbXd4aHJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzYxMzksImV4cCI6MjA5NTk1MjEzOX0.dVmvEp32hYoydnrluwJMeJ9-RvTjVL_N5BB8pViCY0Q";
const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY || "";

// ---- args ----
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const OPT = {
  force: has("--force"),
  dry: has("--dry"),
  limit: val("--limit") ? Number(val("--limit")) : Infinity,
  committee: val("--committee"),
  meeting: val("--meeting") ? Number(val("--meeting")) : undefined,
};

// ---- KMS fetch ----
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Referer: "https://kms.ggc.go.kr/svc/cms/mnts/MntsMbr.do",
  "Accept-Language": "ko-KR,ko;q=0.9",
};
async function fetchMinutes(mntsId) {
  const url = `https://kms.ggc.go.kr/cms/mntsViewer.do?mntsId=${mntsId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      const html = await r.text();
      if (html.length > 2000 && html.includes("mntshtmlviewer")) return html;
    } catch {}
    await sleep(800 * (attempt + 1));
  }
  return null;
}

// ---- HTML parsing ----
const MEMBER_ROLES = new Set([
  "위원장",
  "부위원장",
  "위원",
  "의원",
  "의장",
  "부의장",
]);

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// 발언자 체크박스 목록: sManPV###### → "이름 직책" 라벨
function buildSpeakerMap(html) {
  const map = new Map();
  const re =
    /value="sMan(PV\d+|SV\d+)"[\s\S]*?<label[^>]*>([^<]+)<\/label>/g;
  let m;
  while ((m = re.exec(html))) {
    map.set(m[1], decodeEntities(m[2]).replace(/\s+/g, " ").trim());
  }
  return map;
}

// 본문 영역만 잘라낸다
function extractViewer(html) {
  const i = html.indexOf('id="mntshtmlviewer"');
  if (i < 0) return "";
  const start = html.indexOf(">", i) + 1;
  return html.slice(start);
}

// 라벨("이름 직책" 또는 "직책 이름")에서 이름/직책 분리
function splitLabel(label) {
  // "김완규 위원장" / "김태희 위원"
  let m = /^([가-힣]{2,5})\s+(위원장|부위원장|위원|의원|의장|부의장)$/.exec(label);
  if (m) return { speaker: m[1], role: m[2] };
  // "위원장 김완규"
  m = /^(위원장|부위원장|의장|부의장)\s+([가-힣]{2,5})$/.exec(label);
  if (m) return { speaker: m[2], role: m[1] };
  return null;
}

// SV(공무원/증인) 헤더 텍스트에서 직책/이름 분리: "킨텍스대표이사 이재율"
function splitOfficial(headerText) {
  const t = headerText.replace(/\s+/g, " ").trim();
  const m = /^(.*?)\s*([가-힣]{2,4})$/.exec(t);
  if (m && m[1]) return { speaker: m[2], role: m[1] };
  return { speaker: t || "관계자", role: "공무원" };
}

// 턴 div의 bold 헤더(균형 잡힌 span)를 제거하고 본문만 반환
function turnBody(segment) {
  const open = segment.indexOf("<span class='bold'>");
  if (open < 0) return { header: "", body: stripTags(segment) };
  // 균형 맞춰 닫는 </span> 찾기
  let depth = 0;
  let i = open;
  const tagRe = /<\/?span\b[^>]*>/g;
  tagRe.lastIndex = open;
  let mm;
  let headerEnd = -1;
  while ((mm = tagRe.exec(segment))) {
    if (mm[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) {
      headerEnd = mm.index + mm[0].length;
      break;
    }
  }
  if (headerEnd < 0) return { header: "", body: stripTags(segment) };
  const headerHtml = segment.slice(open, headerEnd);
  const header = stripTags(headerHtml).replace(/^○\s*/, "");
  const body = stripTags(segment.slice(headerEnd));
  return { header, body };
}

function parseMeeting(html) {
  const speakerMap = buildSpeakerMap(html);
  const viewer = extractViewer(html);
  if (!viewer) return [];

  // 턴 분할: <div class='sManXXXX'> 시작 위치들
  const starts = [...viewer.matchAll(/<div class='(sMan[^']+)'>/g)];
  const groups = new Map(); // id -> {id, speaker, role, isMember, text, turns}
  for (let k = 0; k < starts.length; k++) {
    const id = starts[k][1].replace(/^sMan/, "");
    const from = starts[k].index + starts[k][0].length;
    const to = k + 1 < starts.length ? starts[k + 1].index : viewer.length;
    const segment = viewer.slice(from, to);
    const { header, body } = turnBody(segment);
    if (!body) continue;

    let g = groups.get(id);
    if (!g) {
      let speaker, role, isMember;
      const label = speakerMap.get(id);
      const parsed = label ? splitLabel(label) : null;
      if (parsed) {
        speaker = parsed.speaker;
        role = parsed.role;
        isMember = MEMBER_ROLES.has(role);
      } else {
        const off = splitOfficial(header || label || "");
        speaker = off.speaker;
        role = off.role;
        isMember = MEMBER_ROLES.has(role);
      }
      g = { id, speaker, role, isMember, text: "", turns: 0 };
      groups.set(id, g);
    }
    g.text += (g.text ? "\n" : "") + body;
    g.turns += 1;
  }
  return [...groups.values()];
}

// ---- 규칙기반 요약: 인사말·절차성 발언을 걷어내고 실제 내용만 추린다 ----
// 인사·자기소개·선서·진행멘트 등은 주제와 무관하므로 제거한다.
const DROP =
  /(안녕하십니까|반갑습니다|수고\s*많|고생\s*많|진심으로 감사|감사하다는|감사의 말씀|인사를 드리|인사말씀|증인 선서|선서를 하|본인은 경기도의회|의석을 정돈|성원이 되었|개의를 선포|산회를 선포|출석 여부|자리에서 일어나|선서!|^네[.,]?$|^예[.,]?$|^알겠습니다|그렇게 하겠습니다|이상입니다|이상으로|마치겠습니다|다음 질의|다음은|질의해 주시기|답변해 주시기|말씀해 주시기 바랍니다)/;
// 자기소개 문장(예: "부천병 출신 김동희입니다", "경제노동위원회 위원장 OOO입니다")
const INTRO =
  /^[가-힣0-9\s·]*?(?:출신|소속|위원회)?\s*[가-힣]{2,4}\s*(?:위원장|부위원장|위원|의원|국장|실장|과장|본부장|대표이사|단장|소장|부장|팀장|관)?\s*입니다[.]?$/;

function condense(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean
    .split(/(?<=[.?!])\s+|(?<=[다요죠음함])\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  let kept = sentences.filter((s) => !DROP.test(s) && !INTRO.test(s));
  if (kept.length === 0) kept = sentences;
  const picked = [];
  let len = 0;
  for (const s of kept) {
    picked.push(s);
    len += s.length;
    if (len >= 500 || picked.length >= 6) break;
  }
  let out = picked.join(" ");
  if (out.length > 600) out = out.slice(0, 600) + "…";
  return out;
}

// ---- Supabase ----
async function supaRead(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  return r.json();
}
async function supaWrite(method, path, body, prefer) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${path} -> ${r.status} ${t}`);
  }
  return r;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ---- main ----
async function main() {
  if (!OPT.dry && !SERVICE) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다 (쓰기 불가). --dry 로만 가능합니다.");
    process.exit(1);
  }

  // 대상 회의 목록
  let meetings = [];
  if (OPT.meeting) {
    meetings = await supaRead(
      `meetings?select=id,committee,date&id=eq.${OPT.meeting}`
    );
  } else {
    let q = "meetings?select=id,committee,date&order=date.desc";
    if (OPT.committee) q += `&committee=eq.${encodeURIComponent(OPT.committee)}`;
    meetings = await supaRead(q);
  }

  // 이미 발언이 있는 meeting_id 집합 (force 가 아니면 건너뜀)
  const existing = new Set();
  if (!OPT.force) {
    const rows = await supaRead("meeting_statements?select=meeting_id");
    for (const r of rows) existing.add(r.meeting_id);
  }

  const todo = meetings
    .filter((m) => OPT.force || !existing.has(m.id))
    .slice(0, OPT.limit);

  console.log(
    `대상 회의: ${todo.length}건 (전체 ${meetings.length}, 기존보유 ${existing.size}, force=${OPT.force}, dry=${OPT.dry})`
  );

  let ok = 0,
    empty = 0,
    failed = 0,
    rowsTotal = 0;
  for (let idx = 0; idx < todo.length; idx++) {
    const m = todo[idx];
    const tag = `[${idx + 1}/${todo.length}] ${m.committee} ${m.date} #${m.id}`;
    const html = await fetchMinutes(m.id);
    if (!html) {
      console.log(`${tag} — ✗ fetch 실패`);
      failed++;
      continue;
    }
    const groups = parseMeeting(html);
    const rows = groups
      .map((g) => ({
        meeting_id: m.id,
        committee: m.committee,
        speaker: g.speaker,
        role: g.role,
        summary: condense(g.text),
        turns: g.turns,
        chars: g.text.replace(/\s/g, "").length,
        method: "kms",
      }))
      .filter((r) => r.speaker && r.summary);

    if (rows.length === 0) {
      console.log(`${tag} — 발언 0 (건너뜀)`);
      empty++;
      continue;
    }

    const members = rows.filter((r) => MEMBER_ROLES.has(r.role)).length;
    if (OPT.dry) {
      console.log(`${tag} — [dry] 발언자 ${rows.length} (의원 ${members})`);
      if (has("--print"))
        for (const r of rows)
          console.log(
            `   · ${r.speaker} (${r.role}) ×${r.turns} ${r.chars}자 :: ${r.summary.slice(0, 90)}`
          );
    } else {
      try {
        await supaWrite(
          "DELETE",
          `meeting_statements?meeting_id=eq.${m.id}`,
          null
        );
        await supaWrite("POST", "meeting_statements", rows, "return=minimal");
        console.log(`${tag} — ✓ 발언자 ${rows.length} (의원 ${members})`);
      } catch (e) {
        console.log(`${tag} — ✗ 쓰기 실패: ${e.message}`);
        failed++;
        continue;
      }
    }
    ok++;
    rowsTotal += rows.length;
    await sleep(350);
  }

  console.log(
    `\n완료: 성공 ${ok}, 빈회의 ${empty}, 실패 ${failed}, 삽입 발언행 ${rowsTotal}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
