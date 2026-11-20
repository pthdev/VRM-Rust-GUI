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
  
  // Login State
  const [clientId, setClientId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // State für das Eingabe-Modal (File-Upload / JSON Modus)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');

  // Toggle für Netzwerk-Links
  const [showLinks, setShowLinks] = useState(false);
  const [negotiationData, setNegotiationData] = useState(null);
  
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
      
      // Versuche das JSON aus dem Textfeld zu parsen
      try {
        customWorkflow = JSON.parse(jsonText);
        // Überschreibe die client_id im JSON mit der angemeldeten ID
        customWorkflow.client_id = clientId;
      } catch (err) {
        alert("Fehler: Das eingegebene JSON ist ungültig. Bitte korrigieren.");
        return;
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

    if (!isLoggedIn) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">VRM System Login</h2>
            
            <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-lg mb-6">
              <p><strong>Info:</strong>Die Client-ID wird an Workflows angehängt.</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); if (clientId.trim()) setIsLoggedIn(true); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID (Benutzername)</label>
                <input 
                  type="text" 
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Client-ID eingeben"
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
              >
                Anmelden
              </button>
            </form>
          </div>
        </div>
      );
    }

  return (
    <div className="min-h-screen p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">VRM System Dashboard</h1>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-gray-600 mr-4">{isConnected ? 'Verbunden' : 'Getrennt (Verbinde neu...)'}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600 ml-4">
                Angemeldet als: <strong className="text-gray-800">{clientId}</strong>
              </span>
              <button 
                onClick={() => { setIsLoggedIn(false); setClientId(''); }}
                className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
          
          <div className="flex gap-4">
            {/* Toggle für Netzwerk-Links */}
            <div className="flex items-center gap-2 mr-4">
              <label className="text-sm text-gray-700 cursor-pointer flex items-center gap-2">
                <input 
                  type="checkbox"
                  checked={showLinks}
                  onChange={(e) => setShowLinks(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Netzwerk-Links anzeigen
              </label>
            </div>

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
                    .filter((res) => {
                      // Filter-Logik: Blende Netzwerk-Links aus, wenn showLinks = false ist
                      if (showLinks) return true;
                      
                      const nameStr = String(res.name);
                      // Wenn der Name .data. oder .sync. enthält oder mit "Original-Res" beginnt, 
                      // handelt es sich um eine virtuelle Netzwerk-Reservierung
                      if (nameStr.includes('.data.') || nameStr.includes('.sync.') || nameStr.includes('Original-Res:')) {
                        return false;
                      }
                      
                      // Auch die abstrakten Dependency-Graphen ("WorkflowName.TaskName.out_A") ausblenden
                      if (nameStr.includes('.out_') || nameStr.includes('.in_')) {
                        return false;
                      }
                      
                      return true;
                    })
                    .sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate))
                    .map((res) => (
                      <tr key={res.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-sm font-mono text-gray-500">{res.id}</td>
                        <td className="p-4 text-sm font-medium text-gray-800">{String(res.name)}</td>
                        <td className="p-4 flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStateBadgeColor(res.state)}`}>
                            {String(res.state)}
                          </span>
                          {/* MOCK: Lösungs-Button einblenden, wenn Rejected und es sich um den Root-Workflow oder einen echten Task handelt */}
                          {String(res.state) === "Rejected" && 
                           !String(res.name).includes("Original-Res") && 
                           !String(res.name).includes(".data.") &&
                           !String(res.name).includes(".sync.") &&
                           !String(res.name).includes(".out_") &&
                           !String(res.name).includes(".in_") && (
                            <button 
                              onClick={() => setNegotiationData({
                                id: res.id,
                                name: res.name,
                                reason: "ERR_INSUFFICIENT_CAPACITY: Für das gewählte Zeitfenster (Deadline) stehen nicht genügend freie CPUs zur Verfügung.",
                                proposals: [
                                  { id: 1, title: "Zeitfenster verschieben", desc: "Bsp.: Start in 2 Stunden möglich. Deadline verschiebt sich entsprechend.", action: "Verschieben" },
                                  { id: 2, title: "Moldable Job anpassen", desc: "Bsp.: Dauer verdoppeln, dafür nur die halbe Anzahl an CPUs anfordern.", action: "Anpassen" }
                                ]
                              })}
                              className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 cursor-pointer"
                            >
                              💡 Lösungen finden
                            </button>
                          )}
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
            
            <form onSubmit={handleSubmitCustomWorkflow} className="space-y-4">
              
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
            </form>
          </div>
        </div>
      )}

      {/* Negotiation Mock Modal */}
      {negotiationData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 border-t-4 border-red-500">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-red-500">⚠️</span> Einplanung fehlgeschlagen
                </h3>
                <p className="text-sm text-gray-500 mt-1">Betrifft: {negotiationData.name}</p>
              </div>
              <button onClick={() => setNegotiationData(null)} className="text-gray-400 hover:text-gray-700 cursor-pointer text-xl font-bold">&times;</button>
            </div>
            
            <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm mb-6 border border-red-100">
              <strong>Grund:</strong> {negotiationData.reason}
            </div>

            <h4 className="font-semibold text-gray-700 mb-3 text-sm">Lösungsvorschläge vom Scheduler (Mock):</h4>
            
            <div className="space-y-3">
              {negotiationData.proposals.map(prop => (
                <div key={prop.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors flex justify-between items-center group">
                  <div>
                    <h5 className="font-medium text-gray-800 text-sm">{prop.title}</h5>
                    <p className="text-xs text-gray-500 mt-1">{prop.desc}</p>
                  </div>
                  <button 
                    onClick={() => {
                      alert(`Mock: Akzeptiere Vorschlag '${prop.title}'. Das Frontend würde nun ein neues Submit mit angepassten Metadaten (Deadline/CPUs) senden.`);
                      setNegotiationData(null);
                    }}
                    className="px-3 py-1.5 bg-white border border-blue-600 text-blue-600 text-sm font-medium rounded hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                  >
                    {prop.action}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-400 italic">Dieses Feature demonstriert das Negotiation-Pattern.</span>
              <button 
                onClick={() => setNegotiationData(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium text-sm cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
