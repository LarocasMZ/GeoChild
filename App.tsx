
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

// --- Tipagens e Interfaces ---

interface ChildRecord {
  id: string;
  childName: string;
  idType: string;
  idNumber: string;
  caregiverName: string;
  caregiverRelation: string;
  caregiverPhone: string;
  gender: string;
  dob: string;
  scores: Record<string, number>;
  barriers: string[];
  district: string;
  lat: number;
  lng: number;
  timestamp: string;
  severity: string;
  diagnosis?: string;
  isClinicallyConfirmed: boolean;
}

// --- Constantes ---

const DISTRICTS = ["KaMpfumo", "Nlhamankulu", "KaMaxaquene", "KaMavota", "KaMubukwana", "KaTembe", "KaNyaka"];

const ID_TYPES = [
  "Assento de Nascimento",
  "Cédula Pessoal",
  "Bilhete de Identidade (BI)",
  "CARTÃO DE ESTRANGEIRO (DIRE)",
  "NUIT",
  "Não Possui / Em Processo"
];

const RELATIONS = [
  "Mãe",
  "Pai",
  "Avô / Avó",
  "Tio / Tia",
  "Tutor Legal",
  "Outro Familiar"
];

const COMMON_DIAGNOSES = [
  "Paralisia Cerebral",
  "Transtorno do Espectro Autista (Autismo)",
  "Síndrome de Down",
  "Hidrocefalia",
  "Microcefalia",
  "Espina Bífida",
  "Epilepsia",
  "Deficiência Auditiva",
  "Deficiência Visual",
  "Sequelas de Meningite",
  "Sequelas de Malária Cerebral",
  "Atraso Global do Desenvolvimento",
  "Malformações Congénitas",
  "Outros"
];

const CFM_DOMAINS = [
  { id: 'vision', label: 'Visão (Dificuldade em enxergar)' },
  { id: 'hearing', label: 'Audição (Dificuldade em ouvir)' },
  { id: 'mobility', label: 'Mobilidade (Andar ou subir degraus)' },
  { id: 'communication', label: 'Comunicação (Ser compreendido)' },
  { id: 'learning', label: 'Aprendizagem (Aprender coisas novas)' },
  { id: 'behavior', label: 'Comportamento (Controlar emoções)' },
  { id: 'selfcare', label: 'Autocuidado (Vestir-se ou comer)' }
];

const SEVERITY_LEVELS: Record<number, string> = {
  1: "Sem dificuldade",
  2: "Alguma dificuldade",
  3: "Muita dificuldade",
  4: "Não consegue realizar"
};

// --- Componentes Auxiliares ---

const StatCard = ({ title, value, color }: { title: string, value: number, color: string }) => (
  <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold ${color}`}>
      {title.charAt(0)}
    </div>
    <div>
      <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-wider">{title}</p>
      <p className="text-xl md:text-2xl font-black text-slate-800">{value}</p>
    </div>
  </div>
);

// --- Aplicação Principal ---

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'form' | 'map' | 'reports'>('dashboard');
  const [records, setRecords] = useState<ChildRecord[]>([]);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const [locMethod, setLocMethod] = useState<'gps' | 'map' | 'manual'>('gps');
  const [formLat, setFormLat] = useState<number | string>('');
  const [formLng, setFormLng] = useState<number | string>('');

  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string>('');
  const [customDiagnosis, setCustomDiagnosis] = useState<string>('');

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<any>(null);
  const miniMapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('geochild_records');
    if (saved) setRecords(JSON.parse(saved));
  }, []);

  // Mapa Principal
  useEffect(() => {
    if (activeTab === 'map' && mapContainerRef.current && !mapRef.current) {
      // @ts-ignore
      const L = window.L;
      const mapitoCoords: [number, number] = [-25.9692, 32.5732];
      mapRef.current = L.map(mapContainerRef.current).setView(mapitoCoords, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
      records.forEach(r => {
        L.marker([r.lat, r.lng]).addTo(mapRef.current).bindPopup(`<b>${r.childName}</b><br>${r.diagnosis}`);
      });
      // Forçar redimensionamento após montar o mapa
      setTimeout(() => mapRef.current.invalidateSize(), 200);
    }
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [activeTab, records]);

  // Mini Mapa Form
  useEffect(() => {
    if (activeTab === 'form' && locMethod === 'map' && miniMapContainerRef.current && !miniMapRef.current) {
      // @ts-ignore
      const L = window.L;
      miniMapRef.current = L.map(miniMapContainerRef.current).setView([-25.9692, 32.5732], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMapRef.current);
      let marker: any = null;
      miniMapRef.current.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setFormLat(lat.toFixed(6));
        setFormLng(lng.toFixed(6));
        if (marker) miniMapRef.current.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(miniMapRef.current);
      });
      setTimeout(() => miniMapRef.current.invalidateSize(), 200);
    }
    return () => { if (miniMapRef.current) { miniMapRef.current.remove(); miniMapRef.current = null; } };
  }, [activeTab, locMethod]);

  const captureGPS = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setFormLat(pos.coords.latitude.toFixed(6));
      setFormLng(pos.coords.longitude.toFixed(6));
    }, () => alert("Erro ao obter GPS."));
  };

  const saveRecord = (record: ChildRecord) => {
    const newRecords = [...records, record];
    setRecords(newRecords);
    localStorage.setItem('geochild_records', JSON.stringify(newRecords));
    setFormLat(''); setFormLng(''); setSelectedDiagnosis(''); setCustomDiagnosis('');
    setActiveTab('dashboard');
    window.scrollTo(0, 0);
  };

  const generateAIInsight = async () => {
    setIsGeneratingReport(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const summary = JSON.stringify(records.map(r => ({ d: r.diagnosis, s: r.severity })));
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analise estes dados de Maputo em Português: ${summary}`,
        config: { systemInstruction: "Especialista em SIG e Saúde UN." }
      });
      setAiReport(response.text || "Erro.");
    } catch (e) { setAiReport("Erro IA."); }
    finally { setIsGeneratingReport(false); }
  };

  const NavButton = ({ tab, label, icon }: { tab: any, label: string, icon: string }) => (
    <button 
      onClick={() => { setActiveTab(tab); window.scrollTo(0, 0); }} 
      className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-slate-100 md:hover:bg-slate-800'}`}
    >
      <span className="text-lg md:text-base font-bold">{icon}</span>
      <span className="text-[10px] md:text-sm font-bold uppercase md:capitalize">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* SIDEBAR (Desktop) */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-black flex items-center gap-2">
            <span className="text-blue-400">GEO</span>CHILD
          </h1>
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1 font-bold">Piloto Maputo Cidade</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <NavButton tab="dashboard" label="Dashboard" icon="📊" />
          <NavButton tab="form" label="Cadastro" icon="📝" />
          <NavButton tab="map" label="Mapa SIG" icon="📍" />
          <NavButton tab="reports" label="Análise IA" icon="🤖" />
        </nav>
      </aside>

      {/* MOBILE HEADER (Telemóvel) */}
      <header className="md:hidden h-14 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 shadow-lg">
        <h1 className="text-lg font-black tracking-tight"><span className="text-blue-400">GEO</span>CHILD</h1>
        <div className="text-[9px] font-bold bg-blue-600 px-2 py-1 rounded-full uppercase">Piloto</div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 items-center justify-between px-8 shrink-0">
          <h2 className="font-bold text-slate-800 uppercase tracking-widest text-xs">{activeTab}</h2>
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-400">AD</div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 md:pb-8">
          {activeTab === 'dashboard' && (
            <div className="p-4 md:p-8 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Registos" value={records.length} color="bg-blue-500" />
                <StatCard title="Graves" value={records.filter(r => r.severity === 'Alta').length} color="bg-red-500" />
              </div>
              
              <div className="bg-white rounded-2xl shadow-sm border p-4 md:p-6">
                 <h3 className="text-[10px] font-black uppercase mb-4 text-slate-400 tracking-widest">Recém Cadastrados</h3>
                 <div className="space-y-3">
                    {records.length === 0 ? <p className="text-center py-10 text-slate-300 text-sm italic">Nenhum registo efectuado.</p> : 
                    records.slice().reverse().map(r => (
                      <div key={r.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 transition-hover hover:border-blue-200">
                         <div className="max-w-[70%]">
                            <p className="font-bold text-slate-800 text-sm truncate">{r.childName}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{r.diagnosis}</p>
                         </div>
                         <div className="text-right flex flex-col items-end gap-1">
                            <span className="text-[9px] bg-white px-2 py-0.5 rounded border font-bold uppercase">{r.district}</span>
                            <span className={`text-[9px] font-black uppercase ${r.severity === 'Alta' ? 'text-red-500' : 'text-blue-500'}`}>{r.severity}</span>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'form' && (
            <div className="p-0 md:p-8 max-w-4xl mx-auto">
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (!formLat || !formLng) { alert("Localização Geoespacial é obrigatória!"); return; }
                const scores: Record<string, number> = {};
                CFM_DOMAINS.forEach(d => scores[d.id] = parseInt(fd.get(`score_${d.id}`) as string) || 1);
                saveRecord({
                  id: crypto.randomUUID(),
                  childName: fd.get('childName') as string,
                  idType: fd.get('idType') as string, idNumber: fd.get('idNumber') as string,
                  caregiverName: fd.get('caregiverName') as string, caregiverRelation: fd.get('caregiverRelation') as string, caregiverPhone: fd.get('caregiverPhone') as string,
                  gender: fd.get('gender') as string, dob: fd.get('dob') as string, scores, barriers: [], district: fd.get('district') as string,
                  diagnosis: selectedDiagnosis === 'Outros' ? customDiagnosis : selectedDiagnosis,
                  isClinicallyConfirmed: fd.get('is_confirmed') === 'on',
                  lat: Number(formLat), lng: Number(formLng), timestamp: new Date().toISOString(),
                  severity: Object.values(scores).some(s => s >= 3) ? 'Alta' : 'Moderada'
                });
              }} className="bg-white md:rounded-3xl shadow-xl md:border overflow-hidden min-h-screen md:min-h-0">
                
                <div className="bg-slate-900 p-6 md:p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-bold">Novo Inquérito SIG</h3>
                  <p className="text-blue-300 text-[10px] font-bold uppercase tracking-widest mt-1">Colecta de Evidência Local</p>
                </div>
                
                <div className="p-4 md:p-8 space-y-10">
                  
                  {/* Localização */}
                  <section className="space-y-4">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2 flex items-center gap-2">📍 Georreferenciação</h4>
                    <div className="flex p-1 bg-slate-100 rounded-xl overflow-x-auto">
                      {(['gps', 'map', 'manual'] as const).map(m => (
                        <button key={m} type="button" onClick={() => setLocMethod(m)} className={`flex-1 py-3 text-[9px] font-black uppercase rounded-lg transition-all min-w-[80px] ${locMethod === m ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                          {m === 'gps' ? 'Auto GPS' : m === 'map' ? 'Mapa' : 'Manual'}
                        </button>
                      ))}
                    </div>
                    {locMethod === 'gps' && <button type="button" onClick={captureGPS} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl uppercase text-[10px] shadow-lg active:scale-95 transition-all">Activar Sensores e Fixar GPS</button>}
                    {locMethod === 'map' && <div ref={miniMapContainerRef} className="w-full h-48 md:h-64 bg-slate-100 rounded-2xl z-0 border border-slate-200" />}
                    {locMethod === 'manual' && (
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" step="any" value={formLat} onChange={e => setFormLat(e.target.value)} className="p-4 bg-slate-50 border rounded-xl text-sm" placeholder="Latitude" />
                        <input type="number" step="any" value={formLng} onChange={e => setFormLng(e.target.value)} className="p-4 bg-slate-50 border rounded-xl text-sm" placeholder="Longitude" />
                      </div>
                    )}
                    {formLat && <div className="bg-green-600 text-white p-3 rounded-xl text-[10px] font-mono font-bold text-center animate-bounce">Coordenadas Fixadas!</div>}
                  </section>

                  {/* Identificação */}
                  <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2 flex items-center gap-2">👶 Dados da Criança</h4>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Nome Completo</label>
                        <input name="childName" required className="w-full p-4 bg-slate-50 border rounded-xl text-sm outline-none focus:border-blue-500" placeholder="Nome completo..." />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase">Sexo</label>
                          <select name="gender" className="w-full p-4 bg-slate-50 border rounded-xl text-sm">
                            <option value="M">Masculino</option>
                            <option value="F">Feminino</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase">Nascimento</label>
                          <input name="dob" type="date" required className="w-full p-4 bg-slate-50 border rounded-xl text-sm" />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 md:p-6 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
                       <p className="text-[10px] font-black text-blue-700 uppercase">Cuidador Principal (Responsável)</p>
                       <input name="caregiverName" required className="w-full p-4 bg-white border rounded-xl text-sm" placeholder="Nome do Responsável..." />
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <select name="caregiverRelation" className="w-full p-4 bg-white border rounded-xl text-sm">
                           {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                         </select>
                         <input name="caregiverPhone" required type="tel" className="w-full p-4 bg-white border rounded-xl text-sm" placeholder="Telemóvel (+258...)" />
                       </div>
                    </div>
                  </section>

                  {/* Diagnóstico */}
                  <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2 flex items-center gap-2">🏥 Diagnóstico Clínico</h4>
                    <select value={selectedDiagnosis} onChange={(e) => setSelectedDiagnosis(e.target.value)} required className="w-full p-4 bg-slate-50 border rounded-xl text-sm">
                      <option value="">Seleccione a condição...</option>
                      {COMMON_DIAGNOSES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {selectedDiagnosis === 'Outros' && <input type="text" value={customDiagnosis} onChange={(e) => setCustomDiagnosis(e.target.value)} placeholder="Especifique a condição..." className="w-full p-4 border-2 border-blue-100 rounded-xl mt-2 text-sm" />}
                  </section>

                  {/* CFM */}
                  <section className="space-y-6">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2">🧠 Avaliação de Funcionamento (CFM)</h4>
                    {CFM_DOMAINS.map(d => (
                      <div key={d.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                        <p className="text-xs font-black text-slate-800">{d.label}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {Object.entries(SEVERITY_LEVELS).map(([val, label]) => (
                            <label key={val} className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer bg-white has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 transition-all">
                              <input type="radio" name={`score_${d.id}`} value={val} required className="w-4 h-4 text-blue-600" />
                              <span className="text-[11px] font-bold text-slate-700">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>

                  <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-black transition-all active:scale-[0.98] uppercase tracking-widest text-xs">
                    Gravar Registo no Banco de Dados
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'map' && <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />}
          
          {activeTab === 'reports' && (
            <div className="p-6 md:p-12 flex flex-col items-center justify-center text-center h-full space-y-6">
               <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl">🤖</div>
               <h3 className="text-xl md:text-3xl font-black">Evidência Estratégica IA</h3>
               <p className="text-slate-500 text-sm max-w-sm">Use inteligência artificial para prever zonas de risco e necessidades de infraestrutura em Maputo.</p>
               <button onClick={generateAIInsight} disabled={isGeneratingReport} className="bg-blue-600 text-white font-black px-10 py-4 rounded-2xl shadow-xl disabled:opacity-50">
                 {isGeneratingReport ? "Analisando..." : "Gerar Relatório Estratégico"}
               </button>
               {aiReport && (
                 <div className="w-full max-w-3xl bg-white p-6 md:p-10 rounded-3xl shadow-sm text-left border mt-4">
                   <div className="prose prose-slate max-w-none text-sm md:text-base">
                     {aiReport.split('\n').map((p, i) => <p key={i} className="mb-4 text-slate-700 leading-relaxed">{p}</p>)}
                   </div>
                 </div>
               )}
            </div>
          )}
        </div>
      </main>

      {/* BOTTOM NAV (Mobile Only) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around items-center p-2 z-50 h-16 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
        <NavButton tab="dashboard" label="Dash" icon="📊" />
        <NavButton tab="form" label="Novo" icon="📝" />
        <NavButton tab="map" label="Mapa" icon="📍" />
        <NavButton tab="reports" label="IA" icon="🤖" />
      </nav>
    </div>
  );
};

export default App;
