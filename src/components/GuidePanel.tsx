import {
  BookOpen,
  ClipboardPaste,
  Download,
  FilePlus2,
  Library,
  Link,
  Paintbrush,
  Play,
  Search,
  Settings2,
  Tags,
  Upload,
} from "lucide-react";
import type { MessageKey } from "../lib/i18n";

export function GuidePanel({
  t,
  onAddContent,
  onOpenCustomize,
}: {
  t: (key: MessageKey) => string;
  onAddContent: () => void;
  onOpenCustomize: () => void;
}) {
  return (
    <section className="guideWorkspace">
      <div className="customizeHeader guideHero">
        <div>
          <span className="eyebrow">{t("guideEyebrow")}</span>
          <h1>{t("guideTitle")}</h1>
        </div>
        <div className="guideHeroActions">
          <button type="button" onClick={onAddContent}>
            <FilePlus2 size={17} />
            {t("addContent")}
          </button>
          <button type="button" onClick={onOpenCustomize}>
            <Paintbrush size={17} />
            {t("navCustomize")}
          </button>
        </div>
      </div>

      <section className="guideIntroPanel">
        <div className="guideIllustration">
          <div className="guideShelfCard"><BookOpen size={20} /> {t("guideVisualDocument")}</div>
          <div className="guideShelfCard"><Play size={20} /> {t("guideVisualMedia")}</div>
          <div className="guideShelfCard"><Link size={20} /> {t("guideVisualLink")}</div>
          <div className="guideShelfCard"><Tags size={20} /> {t("guideVisualTags")}</div>
        </div>
        <div>
          <h2>{t("guideWhatTitle")}</h2>
          <p>{t("guideWhatText")}</p>
        </div>
      </section>

      <section className="guideGrid">
        <GuideCard icon={<FilePlus2 size={20} />} title={t("guideAddTitle")} text={t("guideAddText")} />
        <GuideCard icon={<ClipboardPaste size={20} />} title={t("guideCaptureTitle")} text={t("guideCaptureText")} />
        <GuideCard icon={<Download size={20} />} title={t("guideTopbarTitle")} text={t("guideTopbarText")} />
        <GuideCard icon={<Library size={20} />} title={t("guideLibraryTitle")} text={t("guideLibraryText")} />
        <GuideCard icon={<MousePointerHint />} title={t("guideOpenTitle")} text={t("guideOpenText")} />
        <GuideCard icon={<Tags size={20} />} title={t("guideOrganizeTitle")} text={t("guideOrganizeText")} />
        <GuideCard icon={<Search size={20} />} title={t("guideSearchTitle")} text={t("guideSearchText")} />
        <GuideCard icon={<Paintbrush size={20} />} title={t("guideCustomizeTitle")} text={t("guideCustomizeText")} />
        <GuideCard icon={<Settings2 size={20} />} title={t("guideSettingsTitle")} text={t("guideSettingsText")} />
        <GuideCard icon={<Upload size={20} />} title={t("guideDataTitle")} text={t("guideDataText")} />
      </section>
    </section>
  );
}

function GuideCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="guideCard">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function MousePointerHint() {
  return (
    <span className="mousePointerHint" aria-hidden="true">
      <span />
    </span>
  );
}

