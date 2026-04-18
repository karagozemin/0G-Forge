type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left"
}: SectionHeadingProps) {
  const alignmentClass = align === "center" ? "text-center items-center" : "text-left items-start";

  return (
    <div className={`flex flex-col gap-3 ${alignmentClass}`}>
      {eyebrow ? (
        <span className="inline-flex rounded-full border border-line bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-brand">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{title}</h2>
      {description ? <p className="max-w-3xl text-sm leading-6 text-textSoft md:text-base">{description}</p> : null}
    </div>
  );
}
