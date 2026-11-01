import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/ws';

// Demo-Modus integriert einen Button, mit dem die Simulation pausiert werden kann.
// Er ist standardmäßig deaktiviert.
// Er kann nur über eine Umgebungsvariable (z.B. in einer .env.development Datei)
// explizit mit VITE_ENABLE_DEMO_MODE=true eingeschaltet werden.
const IS_DEMO_MODE = import.meta.env?.VITE_ENABLE_DEMO_MODE === 'true'; 

function App() {
  const [reservations, setReservations] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState('running');
  
  // State für das Eingabe-Modal (File-Upload / JSON Modus)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputMode, setInputMode] = useState('upload'); // 'upload' oder 'manual'
  const [jsonText, setJsonText] = useState('');
  
  // State für manuellen Modus
  const [workflowName, setWorkflowName] = useState('GUI-Workflow-1');
  const [taskPath, setTaskPath] = useState('/bin/echo "Hello VRM"');
  const [taskDuration, setTaskDuration] = useState(10);
  const [cpus, setCpus] = useState(1);
  const [cwd, setCwd] = useState('');
  const [outputPath, setOutputPath] = useState('slurm-job-%j.out');
  const [errorPath, setErrorPath] = useState('slurm-job-%j.err');

  // Neues Prediction Model
  const [usePrediction, setUsePrediction] = useState(false);
  const [problemSize, setProblemSize] = useState(100);
  const [overheadFactor, setOverheadFactor] = useState(1.2);

  // Auto-Update der Dauer, wenn Prediction aktiv ist und ProblemSize/CPUs sich ändern
  useEffect(() => {
    if (usePrediction) {
      const computedDuration = Math.ceil((problemSize / cpus) * overheadFactor);
      setTaskDuration(computedDuration > 0 ? computedDuration : 1);
    }
  }, [usePrediction, problemSize, cpus, overheadFactor]);
  
  const wsRef = useRef(null);

  useEffect(() => {
    const connectWs = () => {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => setIsConnected(true);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'RESERVATION_STATE_CHANGED') {
          const payload = data.payload;
          
          setReservations((prev) => ({
            ...prev,
            [payload.id]: {
              id: payload.id,
              name: payload.name,
              state: payload.new_state,
              lastUpdate: new Date().toLocaleTimeString()
            }
          }));
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWs, 3000);
      };

      wsRef.current = ws;
    };

    connectWs();
    return () => wsRef.current?.close();
  }, []);

  const handlePause = async () => {
    try {
      await fetch(`${API_BASE}/pause`, { method: 'POST' });
      setSimulationStatus('paused');
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    try {
      await fetch(`${API_BASE}/resume`, { method: 'POST' });
      setSimulationStatus('running');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitCustomWorkflow = async (e) => {
    e.preventDefault();
    try {
      let customWorkflow;
      
      if (inputMode === 'upload') {
        // Versuche das JSON aus dem Textfeld zu parsen
        try {
          customWorkflow = JSON.parse(jsonText);
        } catch (err) {
          alert("Fehler: Das eingegebene JSON ist ungültig. Bitte korrigieren.");
          return;
        }
      } else {
        // Fallback: Manueller Modus
        customWorkflow = {
          client_id: "client-gui-01",
          workflow: {
            id: workflowName.replace(/\s+/g, '-').toLowerCase() + `-${Date.now()}`,
            arrivalTime: 0,
            bookingIntervalStart: 0,
            bookingIntervalEnd: 100,
            reservationState: "Open",
            // Hier ändern wir "Commit" auf "Probe", um zu testen, ob es eingeplant werden kann
            requestProceeding: "Probe",
            tasks: [
              {
                id: `task-${Date.now()}`,
                reservationState: "Open",
                requestProceeding: "Probe", // Auch der Task muss auf Probe stehen
                linkReservation: [],
                nodeReservation: {
                  currentWorkingDirectory: cwd ? cwd : null,
                  environment: null,
                  taskPath: taskPath,
                  outputPath: outputPath ? outputPath : null,
                  errorPath: errorPath ? errorPath : null,
                  duration: parseInt(taskDuration, 10),
                  cpus: parseInt(cpus, 10),
                  isMoldable: usePrediction,
                  dependencies: {
                    data: [],
                    sync: []
                  },
                  dataOut: [],
                  dataIn: []
                }
              }
            ]
          }
        };
      }

      const response = await fetch(`${API_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customWorkflow)
      });
      
      if (!response.ok) {
         const text = await response.text();
         console.error("422 Error:", text);
         alert(`Fehler 422: Das JSON Format passt nicht zum Rust Struct. Details in der Konsole.`);
         return;
      }

      const result = await response.json();
      if (result.status === "error") {
          alert(`Fehler: ${result.message}`);
      } else {
          setIsModalOpen(false); // Modal schließen
      }
    } catch (e) {
      console.error(e);
      alert("Netzwerkfehler beim Einreichen.");
    }
  };

  const getStateBadgeColor = (state) => {
    if (!state) return 'bg-gray-100 text-gray-800';
    
    // Convert to string safely in case it's an object/enum
    const stateStr = String(state);
    
    if (stateStr.includes('Finished') || stateStr.includes('Committed')) return 'bg-green-100 text-green-800';
    if (stateStr.includes('Rejected') || stateStr.includes('Deleted')) return 'bg-red-100 text-red-800';
    if (stateStr.includes('Probe')) return 'bg-blue-100 text-blue-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  return (
    <div className="min-h-screen p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">VRM System Dashboard</h1>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-gray-600">{isConnected ? 'Verbunden' : 'Getrennt (Verbinde neu...)'}</span>
            </div>
          </div>
          
          <div className="flex gap-4">
            {/* Demo-Modus
                Future Work: evt. "Maintenance Mode" mit Admin-Rechten? */}
            {IS_DEMO_MODE && (
              <>
                {simulationStatus === 'running' ? (
                  <button onClick={handlePause} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-colors cursor-pointer">
                    ⏸ Pause
                  </button>
                ) : (
                  <button onClick={handleResume} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors cursor-pointer">
                    ▶ Resume
                  </button>
                )}
              </>
            )}
            
            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm cursor-pointer">
              + Neuen Workflow einreichen
            </button>
          </div>
        </div>

        {/* Live-Tabelle */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-700">Aktive & Kürzliche Reservierungen</h2>
            <span className="text-sm text-gray-500">{Object.keys(reservations).length} Einträge</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="p-4 text-sm font-semibold text-gray-600">ID</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">Name</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">Status</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">Letztes Update</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(reservations).length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-gray-500">
                      Warte auf Daten vom VRM-System...
                    </td>
                  </tr>
                ) : (
                  Object.values(reservations)
                    .sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate))
                    .map((res) => (
                      <tr key={res.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-sm font-mono text-gray-500">{res.id}</td>
                        <td className="p-4 text-sm font-medium text-gray-800">{String(res.name)}</td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStateBadgeColor(res.state)}`}>
                            {String(res.state)}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-gray-500">{res.lastUpdate}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Workflow Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">Workflow einreichen</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer text-xl font-bold">&times;</button>
            </div>
            
            {/* Tabs für Upload und Manuell (nur im Demo-Modus sichtbar!) */}
            {IS_DEMO_MODE && (
              <div className="flex border-b border-gray-200 mb-6">
                <button
                  className={`py-2 px-4 font-medium text-sm focus:outline-none cursor-pointer ${inputMode === 'upload' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setInputMode('upload')}
                >
                  JSON Upload (Empfohlen)
                </button>
                <button
                  className={`py-2 px-4 font-medium text-sm focus:outline-none cursor-pointer ${inputMode === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setInputMode('manual')}
                >
                  Manuelle Eingabe (Test)
                </button>
              </div>
            )}

            <form onSubmit={handleSubmitCustomWorkflow} className="space-y-4">
              
              {(!IS_DEMO_MODE || inputMode === 'upload') && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded border border-blue-100 mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>Hinweis:</strong> Mit <code>requestProceeding: "Probe"</code> kann Einplanung getestet werden. Feedback: <code>ProbeAnswer</code> oder <code>Rejected</code>.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Workflow JSON einfügen</label>
                    <textarea 
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="w-full h-64 border border-gray-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder={`{\n  "client_id": "client-1",\n  "workflow": {\n    "id": "workflow-1",\n    "requestProceeding": "Probe",\n    "bookingIntervalEnd": 1735689600,\n    "tasks": [...]\n  }\n}`}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Oder Datei hochladen</label>
                    <input 
                      type="file" 
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => setJsonText(e.target.result);
                          reader.readAsText(file);
                        }
                      }}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Nur im Demo-Modus den manuellen Block überhaupt rendern */}
              {IS_DEMO_MODE && inputMode === 'manual' && (
                <div className="space-y-4">
                  <div className="bg-yellow-50 p-4 rounded border border-yellow-100 mb-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Probe-Modus:</strong> Workflows, die über das manuelle Formular eingereicht werden, nutzen jetzt automatisch <code>requestProceeding: "Probe"</code>, um die Planbarkeit zu testen.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
                    <input 
                      type="text" 
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Task Pfad / Kommando (taskPath)</label>
                    <input 
                      type="text" 
                      value={taskPath}
                      onChange={(e) => setTaskPath(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm"
                      placeholder="/bin/echo 'hello world'"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Pfad zum Skript oder Kommando, das vom RMS ausgeführt wird.</p>
                  </div>

                  {/* Performance Prediction Toggle */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center text-sm font-semibold text-blue-900 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={usePrediction} 
                          onChange={(e) => setUsePrediction(e.target.checked)}
                          className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        Performance Vorhersagemodell nutzen (Moldable Job)
                      </label>
                    </div>
                    
                    {usePrediction && (
                      <div className="grid grid-cols-2 gap-4 mt-2 p-3 bg-white rounded border border-blue-50">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Problemgröße (Basiseinheiten)</label>
                          <input 
                            type="number" 
                            value={problemSize}
                            onChange={(e) => setProblemSize(Number(e.target.value))}
                            min="1"
                            className="w-full border border-gray-300 rounded p-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Overhead Faktor (Netzwerk/Sync)</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={overheadFactor}
                            onChange={(e) => setOverheadFactor(Number(e.target.value))}
                            min="1"
                            className="w-full border border-gray-300 rounded p-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2 text-xs text-blue-600 italic">
                          Formel: Dauer = (Problemgröße ÷ CPUs) × Overhead
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CPUs (Kerne)</label>
                      <input 
                        type="number" 
                        value={cpus}
                        onChange={(e) => setCpus(e.target.value)}
                        min="1"
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dauer {usePrediction && <span className="text-blue-600 text-xs">(Auto-Berechnet)</span>}
                      </label>
                      <input 
                        type="number" 
                        value={taskDuration}
                        onChange={(e) => setTaskDuration(e.target.value)}
                        min="1"
                        className={`w-full border border-gray-300 rounded-lg p-2 focus:outline-none ${usePrediction ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                        required
                        readOnly={usePrediction}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Working Directory (optional)</label>
                    <input 
                      type="text" 
                      value={cwd}
                      onChange={(e) => setCwd(e.target.value)}
                      placeholder="/path/to/workdir"
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Output Path (optional)</label>
                      <input 
                        type="text" 
                        value={outputPath}
                        onChange={(e) => setOutputPath(e.target.value)}
                        placeholder="slurm-%j.out"
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Error Path (optional)</label>
                      <input 
                        type="text" 
                        value={errorPath}
                        onChange={(e) => setErrorPath(e.target.value)}
                        placeholder="slurm-%j.err"
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end gap-3 border-t mt-6">
                    <button 
                      type="button" 
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium cursor-pointer"
                    >
                      Abbrechen
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer"
                    >
                      Probe einreichen
                    </button>
                  </div>
                </div>
              )}

              {(!IS_DEMO_MODE || inputMode === 'upload') && (
                <div className="pt-4 flex justify-end gap-3 border-t mt-6">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer"
                  >
                    JSON einreichen
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
