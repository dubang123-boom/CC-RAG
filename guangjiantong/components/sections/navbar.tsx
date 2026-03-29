import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { Button } from "../ui-landing/button";
import {
  Navbar as NavbarComponent,
  NavbarLeft,
  NavbarRight,
} from "../ui-landing/navbar";
import { Sheet, SheetContent, SheetTrigger } from "../ui-landing/sheet";

interface NavbarProps {
  className?: string;
}

export default function Navbar({ className }: NavbarProps) {
  return (
    <header className={cn("sticky top-0 z-50 -mb-4 px-4 pb-4", className)}>
      <div className="fade-bottom bg-background/15 absolute left-0 h-24 w-full backdrop-blur-lg"></div>
      <div className="max-w-container relative mx-auto">
        <NavbarComponent>
          <NavbarLeft>
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold"
            >
              <Image
                src="/logo.png"
                alt="有辩法"
                width={32}
                height={32}
                className="rounded-md"
              />
              {siteConfig.name}
            </Link>
          </NavbarLeft>
          <NavbarRight>
            <Link
              href="/dashboard"
              className="hidden text-sm md:block hover:text-foreground/80"
            >
              开始使用
            </Link>
            <Button variant="default" asChild>
              <Link href="/dashboard">立即申辩</Link>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 md:hidden"
                >
                  <Menu className="size-5" />
                  <span className="sr-only">打开导航菜单</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <nav className="grid gap-6 text-lg font-medium">
                  <Link
                    href="/"
                    className="flex items-center gap-2 text-xl font-bold"
                  >
                    <span>{siteConfig.name}</span>
                  </Link>
                  <Link
                    href="/dashboard"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    开始使用
                  </Link>
                  <Link
                    href="#features"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    产品特性
                  </Link>
                  <Link
                    href="#faq"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    常见问题
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </NavbarRight>
        </NavbarComponent>
      </div>
    </header>
  );
}
