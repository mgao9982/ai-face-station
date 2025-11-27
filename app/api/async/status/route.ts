import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json();
    const apiKey = process.env.RUNNING_HUB_API_KEY;

    if (!taskId || !apiKey) throw new Error("缺少 taskId 或 API Key");

    // 直接去问 RunningHub 结果
    const rhRes = await fetch('https://www.runninghub.cn/task/openapi/outputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, taskId }),
    });

    const rhData = await rhRes.json();
    
    // 判断状态
    if (rhData.code === 0) {
      // 成功！返回图片/视频 URL
      // 注意：视频流通常在 data[0].fileUrl
      return NextResponse.json({ status: 'SUCCESS', output: rhData.data[0].fileUrl });
    } else if (rhData.code === 804 || rhData.code === 813) {
      // 804=Running, 813=Queued
      return NextResponse.json({ status: 'RUNNING' });
    } else {
      // 失败
      return NextResponse.json({ status: 'FAILED', msg: rhData.msg });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}