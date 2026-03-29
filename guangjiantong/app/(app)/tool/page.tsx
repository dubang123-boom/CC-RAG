import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import ActivationGate from '@/components/ActivationGate';

export default function ToolPage() {
  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">新建申辩</div>
      </Header>
      <Main>
        <div className="mx-auto w-full max-w-md space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">新建申辩</h1>
            <p className="text-muted-foreground">
              收到行政处罚通知书？15 分钟生成专业申辩书
            </p>
          </div>

          <ActivationGate />

          <div className="space-y-2 text-left text-sm text-muted-foreground">
            <p>&#10003; 15分钟内生成</p>
            <p>&#10003; 申辩书在线生成，直接下载</p>
            <p>&#10003; 覆盖广告法、食品安全法、反不正当竞争法等</p>
          </div>

          <p className="text-xs text-muted-foreground">
            本工具仅供参考，不构成法律意见
          </p>
        </div>
      </Main>
    </>
  );
}
