import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/ws';

function App() {
  const [reservations, setReservations] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState('running');
  
  // State für das Eingabe-Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState('GUI-Workflow-1');
  const [taskPath, setTaskPath] = useState('/bin/echo "Hello VRM"');
  const [taskDuration, setTaskDuration] = useState(10);
  
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
      const customWorkflow = {
        client_id: "client-gui-01",
        workflow: {
          id: workflowName.replace(/\s+/g, '-').toLowerCase() + `-${Date.now()}`,
          arrivalTime: 0,
          bookingIntervalStart: 0,
          bookingIntervalEnd: 100,
          reservationState: "Open",
          requestProceeding: "Commit",
          tasks: [
            {
              id: `task-${Date.now()}`,
              reservationState: "Open",
              requestProceeding: "Commit",
              linkReservation: [],
              nodeReservation: {
                currentWorkingDirectory: null,
                environment: null,
                taskPath: taskPath,
                outputPath: null,
                errorPath: null,
                duration: parseInt(taskDuration, 10),
                cpus: 1,
                isMoldable: false,
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
            {simulationStatus === 'running' ? (
              <button onClick={handlePause} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-colors cursor-pointer">
                ⏸ Pause
              </button>
            ) : (
              <button onClick={handleResume} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors cursor-pointer">
                ▶ Resume
              </button>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">Neuen Workflow einreichen</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer text-xl font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleSubmitCustomWorkflow} className="space-y-4">
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dauer (in Sekunden)</label>
                <input 
                  type="number" 
                  value={taskDuration}
                  onChange={(e) => setTaskDuration(e.target.value)}
                  min="1"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
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
                  Workflow einreichen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
