import Link from "next/link";

import { siteConfig } from "@/config/site";

import { Button } from "../ui-landing/button";
import Glow from "../ui-landing/glow";
import { Section } from "../ui-landing/section";

export default function CTA() {
  return (
    <Section className="group relative overflow-hidden">
      <div className="max-w-container relative z-10 mx-auto flex flex-col items-center gap-6 text-center sm:gap-8">
        <h2 className="max-w-[640px] text-3xl leading-tight font-semibold sm:text-5xl sm:leading-tight">
          别让申辩截止日白白错过
        </h2>
        <p className="text-muted-foreground max-w-[500px] text-balance">
          上传处罚通知书，15 分钟拿到专业申辩书
        </p>
        <div className="flex justify-center gap-4">
          <Button variant="default" size="lg" asChild>
            <Link href={siteConfig.toolUrl}>立即使用</Link>
          </Button>
        </div>
      </div>
      <div className="absolute top-0 left-0 h-full w-full translate-y-[1rem] opacity-80 transition-all duration-500 ease-in-out group-hover:translate-y-[-2rem] group-hover:opacity-100">
        <Glow variant="bottom" />
      </div>
    </Section>
  );
}
