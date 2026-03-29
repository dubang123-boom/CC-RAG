import Link from "next/link";

import { siteConfig } from "@/config/site";

import { Badge } from "../ui-landing/badge";
import { Button } from "../ui-landing/button";
import Glow from "../ui-landing/glow";
import { Mockup, MockupFrame } from "../ui-landing/mockup";
import Screenshot from "../ui-landing/screenshot";
import { Section } from "../ui-landing/section";

export default function Hero() {
  return (
    <Section className="fade-bottom overflow-hidden pb-0 sm:pb-0 md:pb-0">
      <div className="max-w-container mx-auto flex flex-col gap-12 pt-16 sm:gap-24">
        <div className="flex flex-col items-center gap-6 text-center sm:gap-12">
          <Badge variant="outline" className="animate-appear">
            <span className="text-muted-foreground">
              AI 驱动 &middot; 专业法律知识库
            </span>
          </Badge>
          <h1 className="animate-appear from-foreground to-foreground dark:to-muted-foreground relative z-10 inline-block bg-linear-to-r bg-clip-text text-4xl leading-tight font-semibold text-balance text-transparent drop-shadow-2xl sm:text-6xl sm:leading-tight md:text-8xl md:leading-tight">
            收到处罚通知？
            <br />
            有辩法帮你辩
          </h1>
          <p className="text-md animate-appear text-muted-foreground relative z-10 max-w-[740px] font-medium text-balance opacity-0 delay-100 sm:text-xl">
            {siteConfig.description}
          </p>
          <div className="animate-appear relative z-10 flex justify-center gap-4 opacity-0 delay-300">
            <Button variant="default" size="lg" asChild>
              <Link href={siteConfig.toolUrl}>立即使用</Link>
            </Button>
            <Button variant="glow" size="lg" asChild>
              <a href="#features">了解更多</a>
            </Button>
          </div>
          <div className="relative w-full pt-12">
            <MockupFrame
              className="animate-appear opacity-0 delay-700"
              size="small"
            >
              <Mockup
                type="responsive"
                className="bg-background/90 w-full rounded-xl border-0"
              >
                <Screenshot
                  srcLight="/dashboard-light.png"
                  srcDark="/dashboard-dark.png"
                  alt="有辩法产品截图"
                  width={1248}
                  height={765}
                  className="w-full"
                />
              </Mockup>
            </MockupFrame>
            <Glow
              variant="top"
              className="animate-appear-zoom opacity-0 delay-1000"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
