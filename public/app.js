import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

// --- Utility Functions ---

function formatTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function formatCost(n) {
  if (!n) return '$0.00';
  if (n >= 100) return '$' + n.toFixed(0);
  return '$' + n.toFixed(2);
}

function formatDuration(ms) {
  if (!ms) return '0m';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return totalMin + 'm';
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) return hours + 'h';
  return hours + 'h ' + mins + 'm';
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day} ${hours}:${mins}`;
}

function shortModel(model) {
  if (!model) return '-';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model.split('-').slice(-1)[0];
}

function shortDate(dateStr) {
  // 'YYYY-MM-DD' -> 'M/D'
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// --- Chart Components ---

function LineChart({ data, title }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) return null;

  const W = 500, H = 100, padL = 50, padR = 10, padT = 5, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxTokens = Math.max(...data.map(d => d.tokens), 1);
  const maxCost = Math.max(...data.map(d => d.cost), 0.01);

  const xAt = (i) => padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yTokens = (v) => padT + plotH - (v / maxTokens) * plotH;
  const yCost = (v) => padT + plotH - (v / maxCost) * plotH;

  // Build SVG path (smooth curve via catmull-rom-ish approach, or just polyline)
  const tokenPoints = data.map((d, i) => `${xAt(i)},${yTokens(d.tokens)}`);
  const costPoints = data.map((d, i) => `${xAt(i)},${yCost(d.cost)}`);

  const tokenLine = tokenPoints.join(' ');
  const costLine = costPoints.join(' ');

  // Area fill paths
  const tokenArea = `M${tokenPoints[0]} ${tokenPoints.join(' L')} L${xAt(data.length - 1)},${padT + plotH} L${padL},${padT + plotH} Z`;
  const costArea = `M${costPoints[0]} ${costPoints.join(' L')} L${xAt(data.length - 1)},${padT + plotH} L${padL},${padT + plotH} Z`;

  // Y-axis ticks for tokens
  const yTicks = 5;
  const tokenStep = maxTokens / yTicks;

  const labelInterval = data.length > 30 ? 7 : data.length > 15 ? 3 : 1;

  return (
    <div className="chart-wrapper">
      <div className="chart-title">
        {title}
        <span className="chart-legend">
          <span className="legend-dot" style={{background: '#ff6b35'}}></span> tokens
          <span className="legend-dot" style={{background: '#4da6ff', marginLeft: 8}}></span> cost
        </span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setTooltip(null)}>
        {/* Y-axis gridlines + labels */}
        {Array.from({length: yTicks + 1}, (_, i) => {
          const val = tokenStep * i;
          const y = yTokens(val);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="0.5" />
              <text x={padL - 4} y={y + 3} textAnchor="end" className="chart-axis-label">
                {formatTokens(val)}
              </text>
            </g>
          );
        })}
        {/* Token area + line */}
        <path d={tokenArea} fill="#ff6b35" opacity="0.1" />
        <polyline points={tokenLine} fill="none" stroke="#ff6b35" strokeWidth="1.5" />
        {data.map((d, i) => (
          <circle key={`t${i}`} cx={xAt(i)} cy={yTokens(d.tokens)} r="2.5" fill="#ff6b35"
            onMouseEnter={(e) => setTooltip({
              x: e.clientX, y: e.clientY,
              text: `${shortDate(d.date)}: ${formatTokens(d.tokens)} tokens, ${formatCost(d.cost)} (${d.sessions} sessions)`
            })}
          />
        ))}
        {/* Cost area + line */}
        <path d={costArea} fill="#4da6ff" opacity="0.08" />
        <polyline points={costLine} fill="none" stroke="#4da6ff" strokeWidth="1.5" strokeDasharray="3,2" />
        {data.map((d, i) => (
          <circle key={`c${i}`} cx={xAt(i)} cy={yCost(d.cost)} r="2" fill="#4da6ff"
            onMouseEnter={(e) => setTooltip({
              x: e.clientX, y: e.clientY,
              text: `${shortDate(d.date)}: ${formatCost(d.cost)} cost, ${formatTokens(d.tokens)} tokens`
            })}
          />
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => (
          i % labelInterval === 0 ? (
            <text key={d.date} x={xAt(i)} y={H - 2} textAnchor="middle" className="chart-label">
              {shortDate(d.date)}
            </text>
          ) : null
        ))}
      </svg>
      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

const MODEL_COLORS = {
  opus: '#ff6b35',
  sonnet: '#4da6ff',
  haiku: '#00cc6a'
};

function ModelChart({ data, title }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) return null;

  // Normalize model names and compute daily percentages
  const normalizeModel = (m) => {
    if (m.includes('opus')) return 'opus';
    if (m.includes('sonnet')) return 'sonnet';
    if (m.includes('haiku')) return 'haiku';
    return null; // skip unknown/synthetic
  };

  const processed = data.map(d => {
    const byModel = {};
    let total = 0;
    for (const [model, tokens] of Object.entries(d.models || {})) {
      const name = normalizeModel(model);
      if (!name) continue;
      byModel[name] = (byModel[name] || 0) + tokens;
      total += tokens;
    }
    const pcts = {};
    for (const m of ['opus', 'sonnet', 'haiku']) {
      pcts[m] = total > 0 ? (byModel[m] || 0) / total * 100 : 0;
    }
    return { ...d, pcts, total };
  });

  const W = 500, H = 100, padL = 30, padR = 10, padT = 5, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xAt = (i) => padL + (processed.length === 1 ? plotW / 2 : (i / (processed.length - 1)) * plotW);
  const yAt = (pct) => padT + plotH - (pct / 100) * plotH;

  const modelOrder = ['haiku', 'sonnet', 'opus']; // bottom to top for stacking

  // Build stacked area paths
  const areas = {};
  const lines = {};
  for (const model of modelOrder) {
    const points = processed.map((d, i) => {
      // Cumulative percentage up to and including this model
      let cumBelow = 0;
      for (const m of modelOrder) {
        if (m === model) break;
        cumBelow += d.pcts[m];
      }
      const cumTop = cumBelow + d.pcts[model];
      return { x: xAt(i), yTop: yAt(cumTop), yBot: yAt(cumBelow) };
    });

    const topLine = points.map(p => `${p.x},${p.yTop}`).join(' L');
    const botLine = points.slice().reverse().map(p => `${p.x},${p.yBot}`).join(' L');
    areas[model] = `M${topLine} L${botLine} Z`;
    lines[model] = points.map(p => `${p.x},${p.yTop}`).join(' ');
  }

  const labelInterval = data.length > 30 ? 7 : data.length > 15 ? 3 : 1;

  return (
    <div className="chart-wrapper">
      <div className="chart-title">
        {title}
        <span className="chart-legend">
          {['opus', 'sonnet', 'haiku'].map(m => (
            <span key={m}>
              <span className="legend-dot" style={{background: MODEL_COLORS[m], marginLeft: m === 'opus' ? 0 : 8}}></span>
              {' '}{m}
            </span>
          ))}
        </span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setTooltip(null)}>
        {/* Y-axis gridlines */}
        {[0, 25, 50, 75, 100].map(pct => (
          <g key={pct}>
            <line x1={padL} y1={yAt(pct)} x2={W - padR} y2={yAt(pct)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={padL - 4} y={yAt(pct) + 3} textAnchor="end" className="chart-axis-label">
              {pct}%
            </text>
          </g>
        ))}
        {/* Stacked areas */}
        {modelOrder.map(model => (
          <path key={model} d={areas[model]} fill={MODEL_COLORS[model]} opacity="0.25" />
        ))}
        {/* Lines on top */}
        {modelOrder.map(model => (
          <polyline key={`l-${model}`} points={lines[model]} fill="none" stroke={MODEL_COLORS[model]} strokeWidth="1" />
        ))}
        {/* Hover targets */}
        {processed.map((d, i) => (
          <rect key={i} x={xAt(i) - (plotW / processed.length / 2)} y={padT} width={plotW / processed.length} height={plotH}
            fill="transparent" cursor="pointer"
            onMouseEnter={(e) => {
              const parts = ['opus', 'sonnet', 'haiku']
                .filter(m => d.pcts[m] > 0)
                .map(m => `${m}: ${d.pcts[m].toFixed(0)}%`);
              setTooltip({
                x: e.clientX, y: e.clientY,
                text: `${shortDate(d.date)}: ${parts.join(', ')} (${formatTokens(d.total)} tokens)`
              });
            }}
          />
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => (
          i % labelInterval === 0 ? (
            <text key={d.date} x={xAt(i)} y={H - 2} textAnchor="middle" className="chart-label">
              {shortDate(d.date)}
            </text>
          ) : null
        ))}
      </svg>
      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function MonthlySpendChart({ data, title }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) return null;

  const W = 500, H = 100, padL = 40, padR = 10, padT = 10, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxCost = Math.max(...data.map(d => d.cost), 150); // At least 150 so $100 line is visible
  const yScale = (v) => padT + plotH - (v / maxCost) * plotH;

  const barWidth = Math.min(plotW / data.length * 0.6, 40);
  const barGap = plotW / data.length;

  const xAt = (i) => padL + barGap * i + barGap / 2;

  // Y-axis ticks
  const yStep = maxCost <= 200 ? 50 : maxCost <= 500 ? 100 : 250;
  const yTicks = [];
  for (let v = 0; v <= maxCost; v += yStep) yTicks.push(v);

  // Format month label
  const monthLabel = (m) => {
    const [y, mo] = m.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return data.length > 12 ? `${months[parseInt(mo) - 1]} '${y.slice(2)}` : months[parseInt(mo) - 1];
  };

  return (
    <div className="chart-wrapper">
      <div className="chart-title">
        {title}
        <span className="chart-legend">
          <span className="legend-dot" style={{background: 'var(--amber)'}}></span> spend
          <span style={{marginLeft: 8, color: 'var(--green)', fontSize: '8px'}}>--- $100/mo Max Plan</span>
        </span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setTooltip(null)}>
        {/* Y-axis gridlines + labels */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} stroke="var(--border)" strokeWidth="0.5" />
            <text x={padL - 4} y={yScale(v) + 3} textAnchor="end" className="chart-axis-label">
              ${v}
            </text>
          </g>
        ))}
        {/* $100 reference line */}
        <line x1={padL} y1={yScale(100)} x2={W - padR} y2={yScale(100)}
          stroke="var(--green)" strokeWidth="1" strokeDasharray="4,3" />
        <text x={W - padR + 2} y={yScale(100) + 3} className="chart-axis-label" fill="var(--green)" textAnchor="start" style={{fontSize: '5px'}}>
          $100
        </text>
        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.cost / maxCost) * plotH;
          return (
            <g key={d.month}>
              <rect
                x={xAt(i) - barWidth / 2}
                y={yScale(d.cost)}
                width={barWidth}
                height={barH}
                fill="var(--amber)"
                opacity="0.6"
                rx="1"
                onMouseEnter={(e) => setTooltip({
                  x: e.clientX, y: e.clientY,
                  text: `${monthLabel(d.month)} ${d.month.split('-')[0]}: ${formatCost(d.cost)} (${d.sessions} sessions)`
                })}
              />
              {/* Value label above bar */}
              <text x={xAt(i)} y={yScale(d.cost) - 2} textAnchor="middle"
                className="chart-axis-label" fill="var(--amber)" style={{fontSize: '5.5px', fontWeight: 600}}>
                {formatCost(d.cost)}
              </text>
            </g>
          );
        })}
        {/* X-axis labels */}
        {data.map((d, i) => (
          <text key={d.month} x={xAt(i)} y={H - 2} textAnchor="middle" className="chart-label">
            {monthLabel(d.month)}
          </text>
        ))}
      </svg>
      {tooltip && (
        <div className="chart-tooltip" style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function ChartsPanel({ dailyStats, monthlyStats }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <div className="charts-toggle" onClick={() => setCollapsed(!collapsed)}>
        <span className={`charts-toggle-arrow ${collapsed ? 'collapsed' : ''}`}>▼</span>
        DAILY ACTIVITY
      </div>
      {!collapsed && (
        <div className="charts-panel">
          <div className="charts-container">
            <LineChart data={dailyStats} title="USAGE OVER TIME" />
            <ModelChart data={dailyStats} title="MODEL SPLIT" />
            <MonthlySpendChart data={monthlyStats} title="MONTHLY SPEND vs MAX PLAN" />
          </div>
        </div>
      )}
    </>
  );
}

// --- Components ---

function TopBar({ stats, searchQuery, onSearch, wipFilter, onToggleWip, wipCount }) {
  return (
    <div className="top-bar">
      <span className="top-bar-title">CC-MISSION-CONTROL</span>
      <div className="top-bar-stats">
        <span className="stat-item">
          PROJECTS <span className="stat-value green">{stats.projectCount || 0}</span>
        </span>
        <span className="stat-item">
          SESSIONS <span className="stat-value">{stats.sessionCount || 0}</span>
        </span>
        <span className="stat-item">
          EST. COST <span className="stat-value cost">{formatCost(stats.totalCost)}</span>
        </span>
        <span className="stat-item">
          TIME SAVED <span className="stat-value time">{formatDuration(stats.timeSavedMs)}</span>
        </span>
        <span className="stat-item">
          MULTIPLIER <span className="stat-value">{stats.multiplier || '-'}x</span>
        </span>
      </div>
      <div className="top-bar-controls">
        <button
          className={`wip-filter-btn ${wipFilter ? 'active' : ''}`}
          onClick={onToggleWip}
        >
          WIP{wipCount > 0 ? ` (${wipCount})` : ''}
        </button>
        <input
          className="search-input"
          type="text"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
    </div>
  );
}

function Sidebar({ projects, selectedProject, onSelect, activeSessions, wipCounts }) {
  const activeProjects = new Set(activeSessions.map(s => s.cwd));

  const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);

  return (
    <div className="sidebar">
      <div className="sidebar-header">Projects</div>
      <div
        className={`project-item all-projects ${selectedProject === '__all__' ? 'active' : ''}`}
        onClick={() => onSelect('__all__')}
      >
        <span className="project-dot" style={{background: 'var(--green)'}}></span>
        <span className="project-name" style={{fontWeight: 600}}>All Projects</span>
        <span className="project-count">{totalSessions}</span>
      </div>
      <div className="sidebar-divider"></div>
      {projects.map(p => {
        const isActive = activeProjects.has(p.path);
        const hasSessions = p.sessionCount > 0;
        const dotClass = isActive ? 'active' : hasSessions ? 'has-sessions' : '';
        const wip = wipCounts[p.encodedPath] || 0;

        return (
          <div
            key={p.encodedPath}
            className={`project-item ${selectedProject === p.encodedPath ? 'active' : ''}`}
            onClick={() => onSelect(p.encodedPath)}
          >
            <span className={`project-dot ${dotClass}`}></span>
            <span className="project-name">{p.name}</span>
            <span className="project-count">
              {p.sessionCount}{wip > 0 ? <span className="wip-count"> ({wip} WIP)</span> : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ sessionId, status, onChange }) {
  const handleClick = (e) => {
    e.stopPropagation();
    // Cycle: null -> wip -> complete -> null
    const next = !status ? 'wip' : status === 'wip' ? 'complete' : null;
    fetch(`/api/sessions/${sessionId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next })
    })
      .then(r => r.json())
      .then(() => onChange(sessionId, next))
      .catch(console.error);
  };

  const cls = status === 'wip' ? 'status-dot wip' : status === 'complete' ? 'status-dot complete' : 'status-dot';
  const title = status === 'wip' ? 'WIP — click to mark complete' : status === 'complete' ? 'Complete — click to clear' : 'Click to mark WIP';
  const label = status === 'complete' ? '\u2713' : '';

  return (
    <span className={cls} onClick={handleClick} title={title}>{label}</span>
  );
}

function EditableSummary({ sessionId, summary, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(summary || '');

  const handleSave = () => {
    setEditing(false);
    if (value !== (summary || '')) {
      onSave(sessionId, value);
    }
  };

  if (editing) {
    return (
      <input
        className="summary-edit-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setValue(summary || ''); setEditing(false); } }}
        autoFocus
      />
    );
  }

  return (
    <span
      className="summary-text"
      onDoubleClick={() => { setValue(summary || ''); setEditing(true); }}
      title="Double-click to edit"
    >
      {summary || '(no summary)'}
    </span>
  );
}

function SessionTable({ sessions, sortField, sortDir, onSort, projectPath, onStatusChange, onSummaryEdit, showProject, onSelectProject }) {
  const [restoring, setRestoring] = useState(null);
  const [copied, setCopied] = useState(null);

  const sorted = [...sessions].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
  });

  const handleSort = (field) => {
    if (sortField === field) {
      onSort(field, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(field, 'desc');
    }
  };

  const handleRestore = (sessionId, sessionProjectPath) => {
    const cwd = sessionProjectPath || projectPath;
    if (!sessionId || !cwd) return;
    setRestoring(sessionId);
    fetch(`/api/restore/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd })
    })
      .then(r => r.json())
      .then(() => setTimeout(() => setRestoring(null), 2000))
      .catch(() => setRestoring(null));
  };

  const handleCopyId = (sessionId) => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(sessionId);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const arrow = (field) => sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="session-table-container">
      <table className="session-table">
        <thead>
          <tr>
            <th className="col-status"></th>
            <th className="col-date" onClick={() => handleSort('firstTimestamp')}>Created{arrow('firstTimestamp')}</th>
            <th className="col-date" onClick={() => handleSort('lastTimestamp')}>Last Active{arrow('lastTimestamp')}</th>
            <th className="col-sessionid"></th>
            <th className="col-actions"></th>
            {showProject && <th className="col-project" onClick={() => handleSort('projectName')}>Project{arrow('projectName')}</th>}
            <th className="col-summary" onClick={() => handleSort('summary')}>Summary{arrow('summary')}</th>
            <th className="col-model" onClick={() => handleSort('primaryModel')}>Model{arrow('primaryModel')}</th>
            <th className="col-tokens" onClick={() => handleSort('totalTokens')}>Tokens{arrow('totalTokens')}</th>
            <th className="col-cost" onClick={() => handleSort('totalCost')}>Cost{arrow('totalCost')}</th>
            <th className="col-duration" onClick={() => handleSort('durationMs')}>Duration{arrow('durationMs')}</th>
            <th className="col-turns" onClick={() => handleSort('turnCount')}>Turns{arrow('turnCount')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={`${s.sessionId}-${i}`}>
              <td className="col-status">
                {s.sessionId && <StatusDot sessionId={s.sessionId} status={s.status} onChange={onStatusChange} />}
              </td>
              <td className="col-date">{formatDate(s.firstTimestamp)}</td>
              <td className="col-date">{formatDate(s.lastTimestamp)}</td>
              <td className="col-sessionid">
                {s.sessionId && (
                  <button
                    className={`sessionid-btn ${copied === s.sessionId ? 'copied' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleCopyId(s.sessionId); }}
                    title={s.sessionId}
                  >
                    {copied === s.sessionId ? 'copied' : 'sessionid'}
                  </button>
                )}
              </td>
              <td className="col-actions">
                {s.sessionId && (
                  <button
                    className={`restore-btn ${restoring === s.sessionId ? 'restoring' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleRestore(s.sessionId, s.projectPath); }}
                    title={`Resume session in Ghostty\n${s.sessionId}`}
                    disabled={restoring === s.sessionId}
                  >
                    {restoring === s.sessionId ? '...' : 'Launch'}
                  </button>
                )}
              </td>
              {showProject && (
                <td className="col-project">
                  <span className="project-link" onClick={(e) => { e.stopPropagation(); onSelectProject && onSelectProject(s.encodedPath); }}>
                    {s.projectName || '-'}
                  </span>
                </td>
              )}
              <td className="col-summary">
                <EditableSummary sessionId={s.sessionId} summary={s.summary} onSave={onSummaryEdit} />
              </td>
              <td className="col-model">{shortModel(s.primaryModel)}</td>
              <td className="col-tokens">{formatTokens(s.totalTokens)}</td>
              <td className="col-cost">{formatCost(s.totalCost)}</td>
              <td className="col-duration">{formatDuration(s.durationMs)}</td>
              <td className="col-turns">{s.turnCount || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rollup({ aggregate }) {
  if (!aggregate) return null;

  const models = Object.entries(aggregate.tokensByModel || {});
  const totalTokens = models.reduce((sum, [, m]) => sum + m.input + m.output + m.cacheRead + m.cacheWrite, 0);

  return (
    <div className="rollup">
      <div className="rollup-section">
        <div className="rollup-title">Tokens by Model</div>
        {models.map(([model, tokens]) => {
          const modelTotal = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
          const pct = totalTokens > 0 ? (modelTotal / totalTokens * 100) : 0;
          return (
            <div className="model-bar" key={model}>
              <div className="model-bar-fill" style={{ width: Math.max(pct, 1) + '%', maxWidth: '120px' }}></div>
              <span className="model-bar-label">
                {shortModel(model)}: {formatTokens(modelTotal)} ({pct.toFixed(0)}%) — {formatCost(tokens.cost)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="rollup-section">
        <div className="rollup-title">Totals</div>
        <div><span style={{color: 'var(--text-dim)'}}>Input:</span> {formatTokens(aggregate.totalInputTokens)}</div>
        <div><span style={{color: 'var(--text-dim)'}}>Output:</span> {formatTokens(aggregate.totalOutputTokens)}</div>
        <div><span style={{color: 'var(--text-dim)'}}>Cache Read:</span> {formatTokens(aggregate.totalCacheReadTokens)}</div>
        <div><span style={{color: 'var(--text-dim)'}}>Cache Write:</span> {formatTokens(aggregate.totalCacheWriteTokens)}</div>
        <div><span style={{color: 'var(--text-dim)'}}>Tool Calls:</span> {aggregate.totalToolCalls}</div>
      </div>
      <div className="rollup-section">
        <div className="rollup-title">Time</div>
        <div><span style={{color: 'var(--text-dim)'}}>Claude Time:</span> <span style={{color: 'var(--blue)'}}>{formatDuration(aggregate.totalDurationMs)}</span></div>
        <div><span style={{color: 'var(--text-dim)'}}>Est. Manual:</span> <span style={{color: 'var(--amber)'}}>{formatDuration(aggregate.totalDurationMs * 8)}</span></div>
        <div><span style={{color: 'var(--text-dim)'}}>Time Saved:</span> <span style={{color: 'var(--green)'}}>{formatDuration(aggregate.timeSavedMs)}</span></div>
      </div>
    </div>
  );
}

function BottomBar({ activeSessions }) {
  return (
    <div className="bottom-bar">
      <span>
        {activeSessions.length > 0 ? (
          <span className="active-indicator">
            ● ACTIVE: {activeSessions.map(s =>
              `${s.cwd.split('/').pop()} (pid:${s.pid})`
            ).join(' | ')}
          </span>
        ) : (
          <span>No active sessions</span>
        )}
      </span>
      <span>CC-MISSION-CONTROL v0.1.0</span>
    </div>
  );
}

// --- Main App ---

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({});
  const [dailyStats, setDailyStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [sortField, setSortField] = useState('firstTimestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [wipFilter, setWipFilter] = useState(false);
  const [wipSessions, setWipSessions] = useState({});

  // Load projects on mount, then stats + daily stats after cache is populated
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        setProjects(data);
        setLoading(false);
        // Default to All Projects view
        setSelectedProject('__all__');
        // Now that projects are loaded (cache populated), fetch stats + wip
        fetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
        fetch('/api/wip').then(r => r.json()).then(setWipSessions).catch(console.error);
      })
      .catch(err => {
        console.error('Failed to load projects:', err);
        setLoading(false);
      });

    // Poll active sessions
    const poll = setInterval(() => {
      fetch('/api/active').then(r => r.json()).then(setActiveSessions).catch(() => {});
    }, 5000);
    fetch('/api/active').then(r => r.json()).then(setActiveSessions).catch(() => {});

    return () => clearInterval(poll);
  }, []);

  // Load sessions + chart data when project changes
  useEffect(() => {
    if (!selectedProject) return;
    setLoadingSessions(true);

    // Fetch sessions
    const sessionsUrl = selectedProject === '__all__'
      ? '/api/sessions/all'
      : `/api/projects/${selectedProject}/sessions`;
    fetch(sessionsUrl)
      .then(r => r.json())
      .then(data => {
        setSessions(data);
        setLoadingSessions(false);
      })
      .catch(err => {
        console.error('Failed to load sessions:', err);
        setLoadingSessions(false);
      });

    // Fetch chart data filtered by project
    const projectParam = selectedProject !== '__all__' ? `?project=${selectedProject}` : '';
    fetch(`/api/daily-stats${projectParam}`).then(r => r.json()).then(setDailyStats).catch(console.error);
    fetch(`/api/monthly-stats${projectParam}`).then(r => r.json()).then(setMonthlyStats).catch(console.error);
  }, [selectedProject]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
        .then(r => r.json())
        .then(setSearchResults)
        .catch(console.error);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleSort = useCallback((field, dir) => {
    setSortField(field);
    setSortDir(dir);
  }, []);

  const handleSummaryEdit = useCallback((sessionId, newSummary) => {
    fetch(`/api/sessions/${sessionId}/summary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: newSummary })
    })
      .then(r => r.json())
      .then(() => {
        const updater = prev => prev.map(s =>
          s.sessionId === sessionId ? { ...s, summary: newSummary } : s
        );
        setSessions(updater);
        setSearchResults(prev => prev ? updater(prev) : prev);
      })
      .catch(console.error);
  }, []);

  const handleStatusChange = useCallback((sessionId, newStatus) => {
    // Update local session state (both sessions and search results)
    const updater = prev => prev.map(s =>
      s.sessionId === sessionId ? { ...s, status: newStatus } : s
    );
    setSessions(updater);
    setSearchResults(prev => prev ? updater(prev) : prev);
    // Update WIP sessions cache
    setWipSessions(prev => {
      const next = { ...prev };
      if (newStatus === 'wip') {
        next[sessionId] = { status: 'wip', updatedAt: new Date().toISOString() };
      } else {
        delete next[sessionId];
      }
      return next;
    });
  }, []);

  // Count WIP sessions per project from loaded sessions
  const wipCounts = {};
  for (const p of projects) {
    wipCounts[p.encodedPath] = 0;
  }
  // Count from current project's sessions
  if (selectedProject) {
    wipCounts[selectedProject] = sessions.filter(s => s.status === 'wip').length;
  }
  // Also count from global WIP data for other projects — requires session->project mapping
  // For now, the current project count comes from sessions data

  const totalWipCount = Object.keys(wipSessions).length;

  const currentProject = projects.find(p => p.encodedPath === selectedProject);

  // Apply WIP filter
  let displaySessions;
  if (wipFilter) {
    displaySessions = (searchResults || sessions).filter(s => s.status === 'wip');
  } else {
    displaySessions = searchResults || sessions;
  }

  if (loading) {
    return (
      <div className="loading">
        <span className="loading-pulse">SCANNING PROJECTS...</span>
      </div>
    );
  }

  return (
    <>
      <TopBar stats={stats} searchQuery={searchQuery} onSearch={setSearchQuery}
        wipFilter={wipFilter} onToggleWip={() => setWipFilter(f => !f)} wipCount={totalWipCount} />
      <div className="main-layout">
        <Sidebar
          projects={projects}
          selectedProject={selectedProject}
          onSelect={setSelectedProject}
          activeSessions={activeSessions}
          wipCounts={wipCounts}
        />
        <div className="content">
          <ChartsPanel dailyStats={dailyStats} monthlyStats={monthlyStats} />
          {selectedProject === '__all__' ? (
            <>
              <div className="content-header">
                <span className="content-title">All Projects</span>
                <div className="content-stats">
                  <span>Sessions: <strong>{stats.sessionCount || 0}</strong></span>
                  <span>Cost: <strong style={{color: 'var(--amber)'}}>{formatCost(stats.totalCost)}</strong></span>
                  <span>Time: <strong style={{color: 'var(--blue)'}}>{formatDuration(stats.totalDurationMs)}</strong></span>
                </div>
              </div>
              {loadingSessions ? (
                <div className="loading"><span className="loading-pulse">Loading sessions...</span></div>
              ) : displaySessions.length > 0 ? (
                <SessionTable
                  sessions={displaySessions}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  projectPath={null}
                  onStatusChange={handleStatusChange}
                  onSummaryEdit={handleSummaryEdit}
                  showProject={true}
                  onSelectProject={setSelectedProject}
                />
              ) : (
                <div className="empty-state">No sessions found</div>
              )}
              <Rollup aggregate={stats} />
            </>
          ) : currentProject ? (
            <>
              <div className="content-header">
                <span className="content-title">{currentProject.name}</span>
                <div className="content-stats">
                  <span>Sessions: <strong>{currentProject.sessionCount}</strong></span>
                  <span>Cost: <strong style={{color: 'var(--amber)'}}>{formatCost(currentProject.aggregate?.totalCost)}</strong></span>
                  <span>Time: <strong style={{color: 'var(--blue)'}}>{formatDuration(currentProject.aggregate?.totalDurationMs)}</strong></span>
                </div>
              </div>
              {loadingSessions ? (
                <div className="loading"><span className="loading-pulse">Loading sessions...</span></div>
              ) : displaySessions.length > 0 ? (
                <SessionTable
                  sessions={displaySessions}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  projectPath={currentProject.path}
                  onStatusChange={handleStatusChange}
                  onSummaryEdit={handleSummaryEdit}
                />
              ) : (
                <div className="empty-state">No sessions found</div>
              )}
              <Rollup aggregate={currentProject.aggregate} />
            </>
          ) : (
            <div className="empty-state">Select a project</div>
          )}
        </div>
      </div>
      <BottomBar activeSessions={activeSessions} />
    </>
  );
}

// Mount
const root = createRoot(document.getElementById('root'));
root.render(<App />);
