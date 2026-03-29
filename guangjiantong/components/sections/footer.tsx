import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import {
  Footer,
  FooterBottom,
  FooterColumn,
  FooterContent,
} from "../ui-landing/footer";
import { ModeToggle } from "../ui-landing/mode-toggle";

interface FooterSectionProps {
  className?: string;
}

export default function FooterSection({ className }: FooterSectionProps) {
  return (
    <footer className={cn("bg-background w-full px-4", className)}>
      <div className="max-w-container mx-auto">
        <Footer>
          <FooterContent>
            <FooterColumn className="col-span-2 sm:col-span-3 md:col-span-1">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="有辩法"
                  width={24}
                  height={24}
                  className="rounded"
                />
                <h3 className="text-xl font-bold">{siteConfig.name}</h3>
              </div>
              <p className="text-muted-foreground text-sm max-w-[200px]">
                AI 驱动的行政处罚智能申辩工具
              </p>
            </FooterColumn>
            <FooterColumn>
              <h3 className="text-md pt-1 font-semibold">产品</h3>
              <Link
                href="/tool"
                className="text-muted-foreground text-sm"
              >
                开始使用
              </Link>
              <a href="#features" className="text-muted-foreground text-sm">
                产品特性
              </a>
              <a href="#faq" className="text-muted-foreground text-sm">
                常见问题
              </a>
            </FooterColumn>
            <FooterColumn>
              <h3 className="text-md pt-1 font-semibold">法律覆盖</h3>
              <span className="text-muted-foreground text-sm">广告法</span>
              <span className="text-muted-foreground text-sm">食品安全法</span>
              <span className="text-muted-foreground text-sm">反不正当竞争法</span>
            </FooterColumn>
            <FooterColumn>
              <h3 className="text-md pt-1 font-semibold">联系我们</h3>
              <a
                href="mailto:support@youbianfa.com"
                className="text-muted-foreground text-sm"
              >
                support@youbianfa.com
              </a>
            </FooterColumn>
          </FooterContent>
          <FooterBottom>
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-4">
              <span>&copy; {new Date().getFullYear()} 有辩法. 本工具仅供参考，不构成法律意见</span>
              {process.env.NEXT_PUBLIC_ICP_NUMBER && (
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                >
                  {process.env.NEXT_PUBLIC_ICP_NUMBER}
                </a>
              )}
            </div>
            <div className="flex items-center gap-4">
              <ModeToggle />
            </div>
          </FooterBottom>
        </Footer>
      </div>
    </footer>
  );
}
