import CTA from "@/components/sections/cta";
import FAQ from "@/components/sections/faq";
import FooterSection from "@/components/sections/footer";
import Hero from "@/components/sections/hero";
import Items from "@/components/sections/items";
import Navbar from "@/components/sections/navbar";
import Stats from "@/components/sections/stats";
import { LayoutLines } from "@/components/ui-landing/layout-lines";

export default function Home() {
  return (
    <main className="bg-background text-foreground min-h-screen w-full">
      <LayoutLines />
      <Navbar />
      <Hero />
      <Items />
      <Stats />
      <FAQ />
      <CTA />
      <FooterSection />
    </main>
  );
}
