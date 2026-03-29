import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Main } from "@/components/layout/main"

export default function DashboardPage() {
  return (
    <>
      <Header fixed>
        <div className="text-sm font-medium">概览</div>
      </Header>
      <Main>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">欢迎使用有辩法</h1>
            <p className="text-muted-foreground mt-1">
              行政处罚申辩 & 消费者投诉应对
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/tool"
              className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold">新建申辩</h3>
              <p className="text-sm text-muted-foreground mt-1">
                上传处罚通知书，生成专业申辩文书
              </p>
            </Link>
            <Link
              href="/complaint"
              className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold">投诉应对</h3>
              <p className="text-sm text-muted-foreground mt-1">
                收到消费者投诉？快速生成回复方案
              </p>
            </Link>
            <Link
              href="/history"
              className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold">历史案件</h3>
              <p className="text-sm text-muted-foreground mt-1">
                查看已处理的案件记录
              </p>
            </Link>
          </div>
        </div>
      </Main>
    </>
  )
}
