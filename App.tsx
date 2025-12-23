
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
  { id: 'vision', label: 'Visão (Dificuldade em enxergar, mesmo com óculos)' },
  { id: 'hearing', label: 'Audição (Dificuldade em ouvir, mesmo com aparelho)' },
  { id: 'mobility', label: 'Mobilidade (Dificuldade em andar ou subir degraus)' },
  { id: 'communication', label: 'Comunicação (Dificuldade em ser compreendido)' },
  { id: 'learning', label: 'Aprendizagem (Dificuldade em aprender coisas novas)' },
  { id: 'behavior', label: 'Comportamento (Dificuldade em controlar emoções)' },
  { id: 'selfcare', label: 'Autocuidado (Dificuldade em vestir-se ou comer sozinho)' }
];

const SEVERITY_LEVELS: Record<number, string> = {
  1: "Sem dificuldade",
  2: "Alguma dificuldade",
  3: "Muita dificuldade",
  4: "Não consegue realizar"
};

// --- Componentes Auxiliares ---

const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
    <div className={`p-3 rounded-lg ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

// --- Aplicação Principal ---

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'form' | 'map' | 'reports'>('dashboard');
  const [records, setRecords] = useState<ChildRecord[]>([]);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Estados para Localização no Formulário
  const [locMethod, setLocMethod] = useState<'gps' | 'map' | 'manual'>('gps');
  const [formLat, setFormLat] = useState<number | string>('');
  const [formLng, setFormLng] = useState<number | string>('');

  // Estado para Diagnóstico
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string>('');
  const [customDiagnosis, setCustomDiagnosis] = useState<string>('');

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<any>(null);
  const miniMapContainerRef = useRef<HTMLDivElement>(null);

  // Carregar dados iniciais
  useEffect(() => {
    const saved = localStorage.getItem('geochild_records');
    if (saved) {
      setRecords(JSON.parse(saved));
    }
  }, []);

  // Inicialização do Mapa Leaflet
  useEffect(() => {
    if (activeTab === 'map' && mapContainerRef.current && !mapRef.current) {
      // @ts-ignore
      const L = window.L;
      const mapitoCoords: [number, number] = [-25.9692, 32.5732];
      mapRef.current = L.map(mapContainerRef.current).setView(mapitoCoords, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(mapRef.current);
      records.forEach(r => {
        L.marker([r.lat, r.lng]).addTo(mapRef.current).bindPopup(`<b>${r.childName}</b><br>${r.diagnosis || 'Sem Diagnóstico'}<br>Severidade: ${r.severity}`);
      });
    }
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [activeTab, records]);

  // Mini-Mapa Form
  useEffect(() => {
    if (activeTab === 'form' && locMethod === 'map' && miniMapContainerRef.current && !miniMapRef.current) {
      // @ts-ignore
      const L = window.L;
      const mapitoCoords: [number, number] = [-25.9692, 32.5732];
      miniMapRef.current = L.map(miniMapContainerRef.current).setView(mapitoCoords, 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMapRef.current);
      
      let marker: any = null;
      miniMapRef.current.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setFormLat(lat.toFixed(6));
        setFormLng(lng.toFixed(6));
        if (marker) miniMapRef.current.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(miniMapRef.current);
      });
    }
    return () => { if (miniMapRef.current) { miniMapRef.current.remove(); miniMapRef.current = null; } };
  }, [activeTab, locMethod]);

  const captureGPS = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setFormLat(pos.coords.latitude.toFixed(6));
      setFormLng(pos.coords.longitude.toFixed(6));
      alert("GPS Capturado com sucesso!");
    }, () => alert("Erro ao capturar GPS. Verifique as permissões."));
  };

  const saveRecord = (record: ChildRecord) => {
    const newRecords = [...records, record];
    setRecords(newRecords);
    localStorage.setItem('geochild_records', JSON.stringify(newRecords));
    alert("Registo guardado com sucesso!");
    setFormLat('');
    setFormLng('');
    setSelectedDiagnosis('');
    setCustomDiagnosis('');
    setActiveTab('dashboard');
  };

  const generateAIInsight = async () => {
    setIsGeneratingReport(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const summary = JSON.stringify(records.map(r => ({ d: r.diagnosis, s: r.severity, loc: [r.lat, r.lng] })));
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Gere uma análise estratégica sobre estes dados de crianças com deficiência em Maputo: ${summary}`,
        config: { systemInstruction: "Especialista em Saúde Pública UN." }
      });
      setAiReport(response.text || "Erro.");
    } catch (e) { setAiReport("Erro IA."); }
    finally { setIsGeneratingReport(false); }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="text-blue-400 font-black">GEO</span>CHILD
          </h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 font-bold">Piloto Maputo Cidade</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 shadow-lg text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>Dashboard</button>
          <button onClick={() => setActiveTab('form')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'form' ? 'bg-blue-600 shadow-lg text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>Novo Cadastro</button>
          <button onClick={() => setActiveTab('map')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'map' ? 'bg-blue-600 shadow-lg text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>Mapa SIG</button>
          <button onClick={() => setActiveTab('reports')} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'reports' ? 'bg-blue-600 shadow-lg text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}>Análise IA</button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="font-bold text-slate-800 uppercase tracking-widest text-xs">{activeTab}</h2>
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs">AD</div>
        </header>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'dashboard' && (
            <div className="p-8 overflow-y-auto h-full space-y-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Total Registado" value={records.length} color="bg-blue-500" icon={() => <div dangerouslySetInnerHTML={{ __html: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' }} />}/>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                 <h3 className="text-xs font-black uppercase mb-4 text-slate-400">Registos Recentes</h3>
                 <div className="space-y-3">
                    {records.slice().reverse().map(r => (
                      <div key={r.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                         <div>
                            <p className="font-bold text-slate-800">{r.childName}</p>
                            <p className="text-[10px] text-slate-400">{r.diagnosis}</p>
                         </div>
                         <div className="text-right">
                            <span className={`text-[10px] font-black uppercase ${r.severity === 'Alta' ? 'text-red-500' : 'text-blue-500'}`}>{r.severity}</span>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'form' && (
            <div className="p-8 overflow-y-auto h-full custom-scrollbar">
              <div className="max-w-3xl mx-auto pb-20">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  if (!formLat || !formLng) { alert("Erro: Localização obrigatória."); return; }
                  
                  const scores: Record<string, number> = {};
                  CFM_DOMAINS.forEach(d => scores[d.id] = parseInt(fd.get(`score_${d.id}`) as string) || 1);
                  const finalDiagnosis = selectedDiagnosis === 'Outros' ? customDiagnosis : selectedDiagnosis;

                  saveRecord({
                    id: crypto.randomUUID(),
                    childName: fd.get('childName') as string,
                    idType: fd.get('idType') as string,
                    idNumber: fd.get('idNumber') as string,
                    caregiverName: fd.get('caregiverName') as string,
                    caregiverRelation: fd.get('caregiverRelation') as string,
                    caregiverPhone: fd.get('caregiverPhone') as string,
                    gender: fd.get('gender') as string,
                    dob: fd.get('dob') as string,
                    scores,
                    barriers: [],
                    district: fd.get('district') as string,
                    diagnosis: finalDiagnosis,
                    isClinicallyConfirmed: fd.get('is_confirmed') === 'on',
                    lat: Number(formLat),
                    lng: Number(formLng),
                    timestamp: new Date().toISOString(),
                    severity: Object.values(scores).some(s => s >= 3) ? 'Alta' : 'Moderada'
                  });
                }} className="bg-white rounded-3xl shadow-xl border overflow-hidden">
                  
                  <div className="bg-slate-900 p-8 text-white">
                    <h3 className="text-2xl font-bold">Novo Registo Georreferenciado</h3>
                    <div className="mt-2 flex items-center gap-2 text-blue-300 text-[10px] font-bold uppercase tracking-wider">
                       <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span> Sistema de Evidência Maputo
                    </div>
                  </div>
                  
                  <div className="p-8 space-y-12">
                    
                    {/* 1. Localização */}
                    <section className="space-y-6">
                      <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2">1. Coordenadas da Residência</h4>
                      <div className="flex p-1 bg-slate-100 rounded-xl">
                        {(['gps', 'map', 'manual'] as const).map(m => (
                          <button key={m} type="button" onClick={() => setLocMethod(m)} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${locMethod === m ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                            {m === 'gps' ? 'Auto GPS' : m === 'map' ? 'Mapa' : 'Manual'}
                          </button>
                        ))}
                      </div>
                      {locMethod === 'gps' && <button type="button" onClick={captureGPS} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase text-xs shadow-lg">Capturar Localização</button>}
                      {locMethod === 'map' && <div ref={miniMapContainerRef} className="w-full h-64 bg-slate-200 rounded-3xl z-0 border-2 border-slate-100" />}
                      {locMethod === 'manual' && (
                        <div className="grid grid-cols-2 gap-4">
                          <input type="number" step="any" value={formLat} onChange={e => setFormLat(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="Lat" />
                          <input type="number" step="any" value={formLng} onChange={e => setFormLng(e.target.value)} className="p-4 bg-slate-50 border rounded-2xl text-sm" placeholder="Lng" />
                        </div>
                      )}
                      {formLat && formLng && <div className="bg-green-50 p-4 rounded-2xl border border-green-200 text-green-700 font-mono text-xs font-bold text-center">Localização: {formLat}, {formLng}</div>}
                    </section>

                    {/* 2. Identificação da Criança e Cuidador (UN Standard) */}
                    <section className="space-y-8">
                      <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2">2. Identificação e Contactos</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Criança */}
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase">Nome Completo da Criança</label>
                          <input name="childName" required type="text" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-blue-500" placeholder="Insira o nome completo..." />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase">Documento de Identificação</label>
                          <select name="idType" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none">
                            {ID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase">Número do Documento</label>
                          <input name="idNumber" type="text" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:border-blue-500" placeholder="Ex: 1102..." />
                        </div>

                        {/* Cuidador Principal */}
                        <div className="md:col-span-2 mt-4 p-6 bg-blue-50/30 rounded-3xl border border-blue-100 space-y-6">
                           <div className="flex items-center gap-2">
                             <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                             <p className="text-[10px] font-black text-blue-700 uppercase">Cuidador Principal (Primary Caregiver)</p>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="md:col-span-2 space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase">Nome Completo do Cuidador</label>
                                <input name="caregiverName" required type="text" className="w-full p-4 bg-white border rounded-2xl outline-none focus:border-blue-500 shadow-sm" placeholder="Nome completo do responsável..." />
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase">Relação com a Criança</label>
                                <select name="caregiverRelation" className="w-full p-4 bg-white border rounded-2xl outline-none shadow-sm">
                                  {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase">Contacto Telefónico</label>
                                <input name="caregiverPhone" required type="tel" className="w-full p-4 bg-white border rounded-2xl outline-none focus:border-blue-500 shadow-sm" placeholder="+258 8X XXX XXXX" />
                              </div>
                           </div>
                        </div>

                        <div className="space-y-1 mt-4">
                           <label className="text-[10px] font-black text-slate-500 uppercase">Distrito Municipal</label>
                           <select name="district" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none">
                              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                           </select>
                        </div>
                        
                        <div className="space-y-1 mt-4">
                           <label className="text-[10px] font-black text-slate-500 uppercase">Data de Nascimento</label>
                           <input name="dob" type="date" required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none" />
                        </div>
                      </div>
                    </section>

                    {/* 3. Diagnóstico e Funcionamento */}
                    <section className="space-y-8">
                      <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-2">3. Diagnóstico e Avaliação de Funcionamento</h4>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase">Condição Clínica</label>
                        <select value={selectedDiagnosis} onChange={(e) => setSelectedDiagnosis(e.target.value)} required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none">
                          <option value="">Selecione...</option>
                          {COMMON_DIAGNOSES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {selectedDiagnosis === 'Outros' && <input type="text" value={customDiagnosis} onChange={(e) => setCustomDiagnosis(e.target.value)} placeholder="Especifique..." required className="w-full p-4 bg-white border-2 border-blue-100 rounded-2xl mt-4 outline-none" />}
                        <label className="flex items-center gap-2 mt-4 cursor-pointer">
                          <input name="is_confirmed" type="checkbox" className="w-4 h-4 rounded text-blue-600" />
                          <span className="text-[11px] font-bold text-slate-600 italic">Diagnóstico confirmado clinicamente?</span>
                        </label>
                      </div>

                      <div className="bg-slate-50 p-6 rounded-[32px] space-y-6">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Módulo de Funcionamento (OMS/UNICEF)</p>
                         {CFM_DOMAINS.map(d => (
                          <div key={d.id} className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
                            <p className="text-xs font-black text-slate-800">{d.label}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {Object.entries(SEVERITY_LEVELS).map(([val, label]) => (
                                <label key={val} className="flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer bg-white hover:border-blue-500 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 transition-all">
                                  <input type="radio" name={`score_${d.id}`} value={val} required className="w-4 h-4 text-blue-600" />
                                  <span className="text-[11px] font-bold text-slate-700">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <button type="submit" className="w-full bg-slate-900 text-white font-black py-6 rounded-3xl shadow-2xl hover:bg-black transition-all active:scale-[0.98] uppercase tracking-widest text-sm">
                      Gravar Registo no Banco de Dados SIG
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'map' && <div ref={mapContainerRef} className="w-full h-full" />}
          
          {activeTab === 'reports' && (
            <div className="p-12 flex flex-col items-center justify-center text-center h-full space-y-6">
               <h3 className="text-3xl font-bold">Relatório Estratégico</h3>
               <button onClick={generateAIInsight} disabled={isGeneratingReport} className="bg-blue-600 text-white font-black px-12 py-5 rounded-3xl shadow-xl">{isGeneratingReport ? "A analisar..." : "Gerar Análise IA"}</button>
               {aiReport && <div className="max-w-3xl bg-white p-10 rounded-3xl shadow-sm text-left border overflow-auto max-h-[500px] custom-scrollbar">{aiReport.split('\n').map((p, i) => <p key={i} className="mb-4 text-slate-700 leading-relaxed">{p}</p>)}</div>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
