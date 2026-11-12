import { Lamp } from "@/components/cursor/Lamp";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { About } from "@/components/sections/About";
import { Contact } from "@/components/sections/Contact";
import { Differentials } from "@/components/sections/Differentials";
import { Gallery } from "@/components/sections/Gallery";
import { Hero } from "@/components/sections/Hero";
import { KeyUniverse } from "@/components/sections/KeyUniverse";
import { Knowledge } from "@/components/sections/Knowledge";
import { Process } from "@/components/sections/Process";
import { Services } from "@/components/sections/Services";
import { structuredData } from "@/lib/structured-data";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#servicos">
        Pular para o conteúdo
      </a>
      <Lamp />
      <Navbar />
      <main>
        <Hero />
        <Services />
        <KeyUniverse />
        <Knowledge />
        <Process />
        <Differentials />
        <Gallery />
        <About />
        <Contact />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }} />
    </>
  );
}
