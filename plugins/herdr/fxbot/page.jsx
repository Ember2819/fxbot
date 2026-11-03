// How a herdr_list_agents call shows in a reply: the agents as a table. Built into page.js; see the README.

const statusText = { working: "Working", blocked: "Waiting for you", done: "Done", idle: "Idle", unknown: "Unknown" };

function Agents({ call }) {
  if (!call.done) return <p className="text-sm text-muted-foreground">Asking herdr…</p>;
  let agents = null;
  try {
    agents = JSON.parse(call.output ?? "");
  } catch {}
  if (!Array.isArray(agents)) return <p className={`text-sm ${call.error ? "text-destructive" : ""}`}>{call.output}</p>;
  if (!agents.length) return <p className="text-sm text-muted-foreground">herdr runs no agents.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-medium">Pane</th>
            <th className="px-2 py-1.5 font-medium">Agent</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Folder</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.pane} className="border-t">
              <td className="px-2 py-1.5 font-mono">{a.pane}</td>
              <td className="px-2 py-1.5">{a.agent}</td>
              <td className={`px-2 py-1.5 ${a.status === "blocked" ? "font-medium text-destructive" : ""}`}>{statusText[a.status] ?? a.status}</td>
              <td className="max-w-48 truncate px-2 py-1.5 font-mono" title={a.folder}>
                {a.folder}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function setup(app) {
  app.toolView("list_agents", Agents);
}
