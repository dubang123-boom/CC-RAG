import { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui-landing/accordion";
import { Section } from "../ui-landing/section";

interface FAQItemProps {
  question: string;
  answer: ReactNode;
}

const faqItems: FAQItemProps[] = [
  {
    question: "有辩法适用于哪些类型的行政处罚？",
    answer: (
      <p className="text-muted-foreground max-w-[640px] text-balance">
        目前主要覆盖市场监督管理领域的行政处罚，包括广告法、食品安全法、反不正当竞争法、产品质量法、消费者权益保护法等相关违规处罚。后续将持续扩展更多法规领域。
      </p>
    ),
  },
  {
    question: "生成的申辩书有法律效力吗？",
    answer: (
      <>
        <p className="text-muted-foreground mb-4 max-w-[640px] text-balance">
          有辩法生成的申辩书采用规范的法律文书格式，包含完整的事实陈述、法律依据和申辩理由，可以直接作为正式申辩材料提交给行政机关。
        </p>
        <p className="text-muted-foreground max-w-[640px] text-balance">
          但请注意，本工具仅供参考，不构成法律意见。如涉及重大金额处罚，建议在提交前咨询专业律师进行审核。
        </p>
      </>
    ),
  },
  {
    question: "使用流程是怎样的？",
    answer: (
      <div className="text-muted-foreground max-w-[640px] space-y-2">
        <p>整个流程非常简单，仅需四步：</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>上传行政处罚事先告知书（PDF 格式）</li>
          <li>AI 自动分析案件要点，评估申辩可行性</li>
          <li>回答几个补充问题，提供具体情况说明</li>
          <li>自动生成申辩书，下载 Word 文档并打印提交</li>
        </ol>
      </div>
    ),
  },
  {
    question: "我的文件和数据安全吗？",
    answer: (
      <p className="text-muted-foreground max-w-[640px] text-balance">
        我们高度重视数据安全。您上传的处罚文书和生成的申辩书均存储在加密的云端数据库中，不会用于任何其他用途。生成完成后，您可以随时下载，数据将在一定期限后自动清除。
      </p>
    ),
  },
  {
    question: "申辩截止日期快到了怎么办？",
    answer: (
      <p className="text-muted-foreground max-w-[640px] text-balance">
        有辩法会自动识别处罚文书中的申辩截止日期，并在分析结果中醒目提示。从上传到生成完成通常只需约 15 分钟，即使截止日期临近也来得及。生成后下载打印，盖章提交即可。
      </p>
    ),
  },
  {
    question: "什么是听证申请书？我需要申请听证吗？",
    answer: (
      <>
        <p className="text-muted-foreground mb-4 max-w-[640px] text-balance">
          当拟处罚金额较大（个人超过 5000 元、企业超过 50000 元）或涉及吊销许可证等情形时，您有权申请听证。听证是一次面对面陈述理由的机会，对降低处罚金额很有帮助。
        </p>
        <p className="text-muted-foreground max-w-[640px] text-balance">
          有辩法会自动判断您是否符合听证条件，如符合会同时生成听证申请书。请注意听证申请需在收到告知书后 3 日内提出。
        </p>
      </>
    ),
  },
];

export default function FAQ() {
  return (
    <Section id="faq">
      <div className="max-w-container mx-auto flex flex-col items-center gap-8">
        <h2 className="text-center text-3xl font-semibold sm:text-5xl">
          常见问题
        </h2>
        <Accordion type="single" collapsible className="w-full max-w-[800px]">
          {faqItems.map((item, index) => (
            <AccordionItem key={index} value={`item-${index + 1}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
