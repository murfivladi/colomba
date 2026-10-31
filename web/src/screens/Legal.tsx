import type { ReactNode } from 'react';
import privacyRu from '../../../docs/legal/privacy.ru.md?raw';
import privacyIt from '../../../docs/legal/privacy.it.md?raw';
import rulesRu from '../../../docs/legal/rules.ru.md?raw';
import rulesIt from '../../../docs/legal/rules.it.md?raw';
import { useT } from '../i18n';

/** Минимальный рендер Markdown: заголовки, списки, таблицы, жирный текст. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('# ')) out.push(<h1 key={i}>{inline(l.slice(2))}</h1>);
    else if (l.startsWith('## ')) out.push(<h2 key={i}>{inline(l.slice(3))}</h2>);
    else if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(<div key={i} className="scroll-x"><table className="simple"><tbody>{rows.map((r, j) => <tr key={j}>{r.map((c, k) => (j === 0 ? <th key={k}>{inline(c)}</th> : <td key={k}>{inline(c)}</td>))}</tr>)}</tbody></table></div>);
    } else if (/^(\d+\.|-) /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.|-) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-) /, ''));
      i--;
      out.push(<ul key={i}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>);
    } else if (l.trim()) out.push(<p key={i}>{inline(l)}</p>);
  }
  return <>{out}</>;
}

export function Legal() {
  const { lang } = useT();
  return (
    <div>
      <div className="card"><Markdown text={lang === 'it' ? rulesIt : rulesRu} /></div>
      <div className="card"><Markdown text={lang === 'it' ? privacyIt : privacyRu} /></div>
    </div>
  );
}
