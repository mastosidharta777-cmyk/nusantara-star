import Image from "next/image";
import type { Locale } from "@/lib/i18n";

export function ComingSoon({ locale }: { locale: Locale }) {
  const indonesian = locale === "id";

  return <section className="relative flex min-h-[calc(100svh-80px)] overflow-hidden bg-ink px-5 text-white md:px-10">
    <Image
      src="/images/hero-indonesian-audience.png"
      alt=""
      fill
      priority
      sizes="100vw"
      className="object-cover opacity-45"
    />
    <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/65 to-moss/75" />
    <div className="relative mx-auto flex w-full max-w-[1440px] items-end py-16 md:py-24">
      <div className="max-w-3xl">
        <p className="eyebrow !text-[#e68b74]">Nusantara Star · Coming soon</p>
        <h1 className="mt-6 font-display text-[clamp(3.4rem,9vw,8rem)] leading-[.88] tracking-[-.06em]">
          {indonesian ? "Panggung yang tepat, sedang kami kurasi." : "The right stage, being carefully curated."}
        </h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-white/75 md:text-lg">
          {indonesian
            ? "Kami menyiapkan roster talent dan pengalaman booking yang lebih terukur untuk setiap kebutuhan acara."
            : "We are preparing a more considered talent roster and booking experience for every event need."}
        </p>
        <a href="mailto:hello@nusantarastar.com" className="mt-10 inline-flex min-h-14 items-center border border-white/55 px-7 text-xs font-bold uppercase tracking-widest transition hover:bg-white hover:text-ink">
          {indonesian ? "Hubungi kami" : "Contact us"}
        </a>
      </div>
    </div>
  </section>;
}
