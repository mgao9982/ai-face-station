'use client';
import { useState, useRef } from 'react';

// 定义任务结构
interface TaskItem {
  id: string;
  file: File;
  preview: string;
  taskId?: string;
  status: 'waiting' | 'submitting' | 'running' | 'success' | 'failed';
  resultUrl?: string;
  log: string;
  startTime?: number;
  duration?: string;
}

export default function AsyncPage() {
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  
  const faceInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);

  const formatDuration = (ms: number) => (ms / 1000).toFixed(1) + 's';

  // 计算全局进度
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'success' || t.status === 'failed').length;
  const progressPercent = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;
  const isGlobalRunning = tasks.some(t => t.status === 'running' || t.status === 'submitting');

  // 上传身体图
  const handleBodyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newTasks = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
        status: 'waiting' as const,
        log: 'READY',
      }));
      setTasks(prev => [...prev, ...newTasks]);
    }
  };

  // 上传脸部图
  const handleFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFaceFile(e.target.files[0]);
  };

  // 轮询逻辑
  const pollTask = async (index: number, taskId: string) => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/async/status', {
          method: 'POST',
          body: JSON.stringify({ taskId }),
        });
        const data = await res.json();

        setTasks(prev => prev.map((task, i) => {
          if (i !== index) return task;
          
          if (data.status === 'SUCCESS') {
            clearInterval(intervalId);
            const timeTaken = task.startTime ? Date.now() - task.startTime : 0;
            return { ...task, status: 'success', resultUrl: data.output, log: 'DONE', duration: formatDuration(timeTaken) };
          } else if (data.status === 'FAILED') {
            clearInterval(intervalId);
            return { ...task, status: 'failed', log: 'ERR' };
          } else {
            return { ...task, status: 'running', log: 'PROCESSING' };
          }
        }));
      } catch (e) { console.error(e); }
    }, 3000);
  };

  // 批量开始
  const handleStart = async () => {
    if (tasks.length === 0 || !faceFile) return alert('MISSING DATA');
    window.scrollTo({ top: 500, behavior: 'smooth' });

    tasks.forEach(async (task, index) => {
      if (task.status !== 'waiting') return;
      const now = Date.now();
      setTasks(prev => prev.map((t, i) => i === index ? { ...t, status: 'submitting', log: 'INIT...', startTime: now } : t));

      try {
        const formData = new FormData();
        formData.append('body_image', task.file);
        formData.append('face_image', faceFile);

        const res = await fetch('/api/async/trigger', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.taskId) {
          setTasks(prev => prev.map((t, i) => i === index ? { ...t, taskId: data.taskId, status: 'running', log: 'QUEUED' } : t));
          pollTask(index, data.taskId);
        } else { throw new Error('NO ID'); }
      } catch (e: any) {
        setTasks(prev => prev.map((t, i) => i === index ? { ...t, status: 'failed', log: 'FAIL' } : t));
      }
    });
  };

  // 单张重绘
  const handleRegenerate = async (index: number) => {
    if (!faceFile) return;
    const now = Date.now();
    setTasks(prev => prev.map((t, i) => i === index ? { ...t, status: 'submitting', log: 'RETRY', resultUrl: undefined, startTime: now } : t));
    const targetTask = tasks[index];

    try {
      const formData = new FormData();
      formData.append('body_image', targetTask.file);
      formData.append('face_image', faceFile);
      const res = await fetch('/api/async/trigger', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.taskId) {
        setTasks(prev => prev.map((t, i) => i === index ? { ...t, taskId: data.taskId, status: 'running', log: 'QUEUED' } : t));
        pollTask(index, data.taskId);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-[#E0E5EC] text-[#2D3436] font-sans selection:bg-black selection:text-white overflow-x-hidden relative">
      
      {/* 背景装饰 */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white blur-[150px] opacity-60 pointer-events-none"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[#C3CBD6] blur-[150px] opacity-40 pointer-events-none"></div>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
         <svg width="100%" height="100%"><path d="M0,100 Q400,200 800,0" fill="none" stroke="black" strokeWidth="1" /><circle cx="80%" cy="20%" r="150" fill="none" stroke="black" strokeWidth="0.5" /></svg>
      </div>

      <main className="relative z-10 max-w-[1600px] mx-auto px-6 py-12 flex flex-col lg:flex-row items-center justify-center min-h-screen gap-12 lg:gap-24">
        
        {/* 左侧：身体图列表 */}
        <div className="lg:w-1/4 w-full flex flex-col gap-4 order-2 lg:order-1 h-[600px]">
          <div className="flex justify-between items-end border-b border-black/10 pb-2 mb-4">
            <h2 className="text-4xl font-light tracking-tighter">BODY<br/>SOURCE</h2>
            <div className="text-xs font-bold tracking-widest opacity-40 text-right">MULTI<br/>SELECT</div>
          </div>

          <div onClick={() => bodyInputRef.current?.click()} className="h-24 w-full rounded-2xl bg-white/30 backdrop-blur-md border border-white/50 flex items-center justify-between px-6 cursor-pointer hover:bg-white/60 transition duration-500 group shadow-lg shadow-black/5">
            <span className="text-xs font-bold tracking-widest opacity-60 group-hover:opacity-100">ADD IMAGES</span>
            <div className="w-8 h-8 rounded-full border border-black/20 flex items-center justify-center group-hover:bg-black group-hover:text-white transition">+</div>
            <input ref={bodyInputRef} type="file" multiple className="hidden" onChange={handleBodyUpload} />
          </div>

          <div className="space-y-3 max-h-full overflow-y-auto pr-2 custom-scrollbar flex-1">
            {tasks.map((task) => (
              <div key={task.id} className="relative flex items-center gap-4 p-3 rounded-xl bg-white/40 backdrop-blur-sm border border-white/40 overflow-hidden">
                {/* ✨ 单体进度条背景 - 只有在运行时显示 */}
                {task.status === 'running' && (
                   <div className="absolute bottom-0 left-0 h-[2px] bg-black/80 animate-progress w-full"></div>
                )}
                
                <img src={task.preview} className="w-12 h-12 rounded-lg object-cover grayscale opacity-80" />
                <div className="flex-1 min-w-0 z-10">
                  <div className="text-[10px] font-mono opacity-50 truncate">{task.file.name}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-[9px] font-bold tracking-widest px-2 py-0.5 rounded ${
                      task.status === 'success' ? 'bg-green-200 text-green-800' : 
                      task.status === 'running' ? 'bg-black text-white' : 'bg-white/50'
                    }`}>
                      {task.log}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 中间：胶囊核心 */}
        <div className="lg:w-1/3 w-full flex flex-col items-center order-1 lg:order-2 relative">
          <div className="relative w-[320px] h-[520px] rounded-[160px] bg-white/10 backdrop-blur-2xl border border-white/40 shadow-2xl shadow-black/10 flex flex-col items-center justify-between p-4 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none"></div>

            <div onClick={() => faceInputRef.current?.click()} className="relative mt-6 w-[260px] h-[260px] rounded-full bg-black/5 border border-white/20 overflow-hidden cursor-pointer transition duration-700 group hover:scale-105">
              {faceFile ? <img src={URL.createObjectURL(faceFile)} className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-black/30"><span className="text-4xl font-thin mb-2">+</span><span className="text-[10px] tracking-widest uppercase">Face Ref</span></div>}
              <input ref={faceInputRef} type="file" className="hidden" onChange={handleFaceUpload} />
            </div>

            <div className="text-center z-10 mt-4 w-full px-8">
              <div className="text-[10px] tracking-[0.3em] opacity-50 mb-2">NEURAL LINK</div>
              <h1 className="text-5xl font-light tracking-tighter text-black mix-blend-overlay">LUNAR</h1>
              
              {/* ✨ 全局进度条显示区域 */}
              <div className="mt-6 w-full">
                {isGlobalRunning ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-bold tracking-widest opacity-60">
                      <span>PROCESSING</span>
                      <span>{completedTasks} / {totalTasks}</span>
                    </div>
                    <div className="h-1 w-full bg-black/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-black transition-all duration-500 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[8px] opacity-40 leading-tight">THE MOON HAS ARISE <br/> OUR WORLD DIDNT COLLIDE</div>
                )}
              </div>
            </div>

            <button onClick={handleStart} disabled={isGlobalRunning} className={`mb-8 text-white w-[200px] h-12 rounded-full flex items-center justify-center gap-2 shadow-lg transition duration-300 z-20 ${isGlobalRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#2D3436] hover:scale-105'}`}>
              <span className="text-xs font-bold tracking-widest">{isGlobalRunning ? 'BUSY' : 'GENERATE'}</span>
            </button>
          </div>
        </div>

        {/* 右侧：结果画廊 */}
        <div className="lg:w-1/3 w-full h-[600px] order-3 relative">
           <div className="absolute -top-10 right-0 text-[120px] font-thin text-black/5 leading-none pointer-events-none">02</div>
           <h2 className="text-2xl font-light tracking-tight mb-6 border-l-2 border-black pl-4">OUTPUT<br/>GALLERY</h2>
           
           <div className="grid grid-cols-2 gap-4 h-full overflow-y-auto pb-20 content-start custom-scrollbar">
              {tasks.filter(t => t.resultUrl).map((task, index) => (
                <div key={task.id} className="relative aspect-[3/4] bg-white p-2 rounded-2xl shadow-md group transition hover:-translate-y-1">
                   <div className="w-full h-full rounded-xl overflow-hidden relative bg-black/5">
                      <img src={task.resultUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                         {task.duration && <div className="text-white text-xs font-mono border border-white/30 px-2 py-1 rounded-full">{task.duration}</div>}
                         <div className="flex gap-2">
                            <button onClick={() => handleRegenerate(tasks.indexOf(task))} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition">↺</button>
                            <a href={task.resultUrl} target="_blank" download className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition">↓</a>
                         </div>
                      </div>
                   </div>
                </div>
              ))}
              {tasks.filter(t => t.resultUrl).length === 0 && <div className="col-span-2 h-64 border border-dashed border-black/10 rounded-3xl flex items-center justify-center text-xs tracking-widest opacity-40">WAITING FOR OUTPUT...</div>}
           </div>
        </div>

      </main>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
        @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
        .animate-progress { animation: progress 2s infinite cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  );
}