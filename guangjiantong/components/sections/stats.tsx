import { Section } from "../ui-landing/section";

const stats = [
  {
    label: "已服务",
    value: "500",
    suffix: "+",
    description: "企业和个体工商户",
  },
  {
    label: "覆盖",
    value: 15,
    suffix: "+",
    description: "部法律法规知识库",
  },
  {
    label: "平均",
    value: 15,
    description: "分钟完成申辩书生成",
  },
  {
    label: "用户满意度",
    value: "95",
    suffix: "%",
    description: "认为文书质量满意",
  },
];

export default function Stats() {
  return (
    <Section>
      <div className="container mx-auto max-w-[960px]">
        <div className="grid grid-cols-2 gap-12 sm:grid-cols-4">
          {stats.map((item, index) => (
            <div
              key={index}
              className="flex flex-col items-start gap-3 text-left"
            >
              {item.label && (
                <div className="text-muted-foreground text-sm font-semibold">
                  {item.label}
                </div>
              )}
              <div className="flex items-baseline gap-2">
                <div className="from-foreground to-foreground dark:to-brand bg-linear-to-r bg-clip-text text-4xl font-medium text-transparent drop-shadow-[2px_1px_24px_var(--brand-foreground)] transition-all duration-300 sm:text-5xl md:text-6xl">
                  {item.value}
                </div>
                {item.suffix && (
                  <div className="text-brand text-2xl font-semibold">
                    {item.suffix}
                  </div>
                )}
              </div>
              {item.description && (
                <div className="text-muted-foreground text-sm font-semibold text-pretty">
                  {item.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
