from pathlib import Path

app=Path('src/client/PremiumApp.tsx')
s=app.read_text()
import_anchor="import { CustomersPage } from './CustomersPage';"
if "ManagerWorkflowPanel" not in s:
    if import_anchor not in s: raise SystemExit('import anchor missing')
    s=s.replace(import_anchor,import_anchor+"\nimport { ManagerWorkflowPanel } from './ManagerWorkflowPanel';",1)

old="{ops.lastContactAt&&<p className=\"px-form-note\">Последний контакт: {new Date(ops.lastContactAt).toLocaleString('ru-RU')}</p>}</section></>;"
new="{ops.lastContactAt&&<p className=\"px-form-note\">Последний контакт: {new Date(ops.lastContactAt).toLocaleString('ru-RU')}</p>}</section><ManagerWorkflowPanel orderId={order.id} currentDate={order.selectedDate} /></>;"
if old not in s: raise SystemExit('manager workflow anchor missing')
s=s.replace(old,new,1)
app.write_text(s)

css=Path('src/client/styles/premium.css')
c=css.read_text()
marker='/* INTERNAL_WORKFLOW_V4 */'
if marker not in c:
    c += '''\n/* INTERNAL_WORKFLOW_V4 */
.px-operation-choice{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:14px 0}.px-operation-choice button{border:1px solid var(--px-line);background:#fff;border-radius:12px;padding:11px 7px;font-size:10px;font-weight:800;color:var(--px-muted)}.px-operation-choice button.active{background:var(--px-green);border-color:var(--px-green);color:#fff}.px-crm-edit-toggle{width:100%;border:0;border-top:1px solid var(--px-line);background:transparent;padding:13px 0 0;margin-top:12px;text-align:left;color:var(--px-green);font-size:10px;font-weight:900}.px-crm-editor{margin-top:14px;padding-top:14px;border-top:1px solid var(--px-line)}.px-crm-task-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}.px-owner-audit-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}.px-owner-audit-head h3{margin:7px 0 0}.px-audit-list{display:grid}.px-audit-list>div{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--px-line)}.px-audit-role{font-size:8px;text-transform:uppercase;font-weight:900;letter-spacing:.08em;border-radius:999px;padding:6px 8px;text-align:center;background:#eee8dc;color:#655b49}.px-audit-role.role-manager{background:#e2eee9;color:#17483e}.px-audit-role.role-admin{background:#ece7f2;color:#5b466d}.px-audit-role.role-owner{background:#ede7d9;color:#6a5725}.px-audit-role.role-tourist{background:#e7edf2;color:#345166}.px-audit-list b{font-size:11px}.px-audit-list p{font-size:9px;color:var(--px-muted);margin:3px 0 0}.px-audit-list time{font-size:8px;color:var(--px-muted);text-align:right;white-space:nowrap}
@media(max-width:520px){.px-crm-task-row{grid-template-columns:1fr}.px-owner-audit-head{display:grid}.px-audit-list>div{grid-template-columns:68px 1fr}.px-audit-list time{grid-column:2;text-align:left}.px-operation-choice{grid-template-columns:1fr}}
'''
    css.write_text(c)
print('internal ui v4 applied')
