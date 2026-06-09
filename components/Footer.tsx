import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-gray-200 bg-white print:hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col items-center gap-3 text-center">
        <Image
          src="/ggc-logo.png"
          alt="경기도의회 Gyeonggido Assembly"
          width={200}
          height={62}
          className="h-12 w-auto"
        />
        <p className="text-sm font-semibold text-[#1F4E79]">
          사람중심 민생중심 의회다운 의회
        </p>
        <p className="text-xs text-gray-400">
          ⓒ 경기도의회 · 행정사무감사 자료관리 시스템
        </p>
      </div>
    </footer>
  );
}
