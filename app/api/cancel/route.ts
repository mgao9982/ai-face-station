import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json();
    const apiKey = process.env.RUNNING_HUB_API_KEY;

    if (!taskId || !apiKey) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    console.log(`[Cancel] 正在取消: ${taskId}`);

    const rhRes = await fetch('https://www.runninghub.cn/task/openapi/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, taskId }),
    });

    const rhData = await rhRes.json();
    // 打印结果方便调试
    console.log(`[Cancel] 结果:`, rhData);

    return NextResponse.json(rhData);

  } catch (error: any) {
    console.error("[Cancel] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}