import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import ActivationGate from '@/components/ActivationGate';

export default function ComplaintPage() {
  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">投诉应对</div>
      </Header>
      <Main>
        <div className="mx-auto w-full max-w-md space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">投诉应对</h1>
            <p className="text-muted-foreground">
              收到 12315 消费者投诉？快速生成专业回复方案
            </p>
          </div>

          <ActivationGate uploadComponent="complaint" />

          <div className="space-y-2 text-left text-sm text-muted-foreground">
            <p>&#10003; 智能分析投诉内容，评估升级风险</p>
            <p>&#10003; 自动生成回复函、协商话术、整改清单</p>
            <p>&#10003; 覆盖消保法、食品安全法、电商法等</p>
          </div>

          <p className="text-xs text-muted-foreground">
            本工具仅供参考，不构成法律意见
          </p>
        </div>
      </Main>
    </>
  );
}
