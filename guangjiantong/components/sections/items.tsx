import {
  BrainCircuitIcon,
  ClockIcon,
  FileTextIcon,
  GavelIcon,
  MessageSquareWarningIcon,
  ScaleIcon,
  SearchIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";

import { Item, ItemDescription, ItemIcon, ItemTitle } from "../ui-landing/item";
import { Section } from "../ui-landing/section";

const items = [
  {
    title: "AI 智能分析",
    description: "自动识别处罚文书中的违法事实、法律依据和程序问题",
    icon: <BrainCircuitIcon className="size-5 stroke-1" />,
  },
  {
    title: "12315 投诉应对",
    description: "智能分析消费者投诉，生成回复函、协商话术和整改方案",
    icon: <MessageSquareWarningIcon className="size-5 stroke-1" />,
  },
  {
    title: "15 分钟生成",
    description: "从上传到完成申辩书，全程仅需约 15 分钟",
    icon: <ClockIcon className="size-5 stroke-1" />,
  },
  {
    title: "专业法律知识库",
    description: "内置广告法、消保法、食品安全法等 15+ 部法规",
    icon: <ScaleIcon className="size-5 stroke-1" />,
  },
  {
    title: "案例检索",
    description: "基于 RAG 技术检索相关判例，为申辩提供有力支撑",
    icon: <SearchIcon className="size-5 stroke-1" />,
  },
  {
    title: "风险智能评估",
    description: "自动评估申辩可行性和投诉升级风险",
    icon: <ShieldCheckIcon className="size-5 stroke-1" />,
  },
  {
    title: "Word 文档下载",
    description: "一键下载格式规范的 Word 文书，打印即可提交",
    icon: <FileTextIcon className="size-5 stroke-1" />,
  },
  {
    title: "听证申请书",
    description: "符合条件时自动生成听证申请书，争取更多权益",
    icon: <GavelIcon className="size-5 stroke-1" />,
  },
  {
    title: "手机端适配",
    description: "随时随地使用，电脑和手机端都有良好体验",
    icon: <SmartphoneIcon className="size-5 stroke-1" />,
  },
];

export default function Items() {
  return (
    <Section id="features">
      <div className="max-w-container mx-auto flex flex-col items-center gap-6 sm:gap-20">
        <h2 className="max-w-[560px] text-center text-3xl leading-tight font-semibold sm:text-5xl sm:leading-tight">
          智能申辩，专业可靠
        </h2>
        <div className="grid auto-rows-fr grid-cols-2 gap-0 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {items.map((item, index) => (
            <Item key={index}>
              <ItemTitle className="flex items-center gap-2">
                <ItemIcon>{item.icon}</ItemIcon>
                {item.title}
              </ItemTitle>
              <ItemDescription>{item.description}</ItemDescription>
            </Item>
          ))}
        </div>
      </div>
    </Section>
  );
}
