/**
 * Styles for the Asset Library and Motion Editor overlays. They are
 * full-screen surfaces with their own layout, so they carry scoped CSS
 * (al-*, me-*) that reads the editor's theme variables with dark fallbacks.
 */
export const OVERLAY_CSS = `
.al-root,.me-root{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:var(--background,#0b0d12);color:var(--foreground,#e8eaf0);font:13px/1.4 Inter,"Noto Sans Sinhala","Noto Sans Tamil",system-ui,sans-serif}
.al-root *,.me-root *{box-sizing:border-box}
.al-head,.me-head{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border,#232836)}
.al-title,.me-title{font-size:15px;font-weight:650;letter-spacing:.01em;margin-right:8px;white-space:nowrap}
.al-search{flex:1;max-width:460px;background:var(--input,#141822);border:1px solid var(--border,#232836);border-radius:var(--ui-radius,5px);color:inherit;padding:7px 10px;font:inherit}
.al-btn,.me-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border,#2a3040);background:var(--secondary,#171b26);color:inherit;border-radius:var(--ui-radius,5px);padding:6px 11px;font:inherit;font-weight:550;cursor:pointer;white-space:nowrap}
.al-btn:hover,.me-btn:hover{background:var(--accent,#1f2433)}
.al-btn.primary,.me-btn.primary{background:#4c8dff;border-color:#4c8dff;color:#fff}
.al-btn.primary:hover,.me-btn.primary:hover{background:#3b7af0}
.al-btn.ghost,.me-btn.ghost{background:transparent;border-color:transparent}
.al-btn:disabled,.me-btn:disabled{opacity:.45;cursor:default}
.al-close{margin-left:auto}
.al-tabs{display:flex;gap:2px;padding:0 18px;border-bottom:1px solid var(--border,#232836);overflow-x:auto}
.al-tab{border:0;background:none;color:var(--muted-foreground,#8b93a7);padding:10px 12px;font:inherit;font-weight:550;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.al-tab[aria-selected=true]{color:var(--foreground,#e8eaf0);border-bottom-color:#4c8dff}
.al-tab .n{opacity:.6;margin-left:5px;font-weight:450}
.al-body{flex:1;display:flex;min-height:0}
.al-main{flex:1;overflow:auto;padding:16px 18px}
.al-hover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.al-hover-sound{position:absolute;left:8px;bottom:8px;padding:2px 8px;border-radius:10px;background:rgba(0,0,0,.65);color:#fff;font-size:12px;animation:alPulse 1s ease-in-out infinite}
@keyframes alPulse{50%{opacity:.4}}
.al-sort{background:transparent;color:inherit;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:6px;padding:4px 6px;font-size:12px}
.al-sort option{color:var(--foreground,#111);background:var(--popover,#fff)}
.al-menu-scrim{position:fixed;inset:0;z-index:60}
.al-menu{position:fixed;z-index:61;min-width:220px;padding:6px;border-radius:10px;background:var(--popover,#161a24);color:var(--popover-foreground,inherit);border:1px solid color-mix(in srgb,currentColor 10%,transparent);box-shadow:0 12px 40px rgba(0,0,0,.45);display:flex;flex-direction:column}
.al-menu-title{padding:6px 10px 8px;font-size:12px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.al-menu-item{text-align:left;padding:7px 10px;border-radius:6px;font-size:13px;background:transparent;border:0;color:inherit;cursor:pointer}
.al-menu-item:hover:not(:disabled){background:rgba(76,141,255,.18)}
.al-menu-item.danger{color:#f87171}
.al-menu-item:disabled{opacity:.4;cursor:default}
.al-menu-sep{height:1px;margin:4px 6px;background:color-mix(in srgb,currentColor 8%,transparent)}
.al-notice{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:62;padding:9px 16px;border-radius:8px;background:#1f2937;color:#fff;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.al-list{display:flex;flex-direction:column;gap:2px}
.al-srow{display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:8px;border:1px solid transparent}
.al-srow:hover{background:color-mix(in srgb,currentColor 4%,transparent)}
.al-srow[aria-current=true]{border-color:rgba(76,141,255,.6);background:rgba(76,141,255,.08)}
.al-play{width:32px;height:32px;flex-shrink:0;border-radius:50%;border:0;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;cursor:pointer;font-size:12px}
.al-play:hover,.al-play.on{background:#4c8dff;color:#fff}
.al-srow-main{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;background:transparent;border:0;color:inherit;cursor:pointer;text-align:left;padding:0}
.al-srow-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.al-srow-sub{font-size:11px;opacity:.55;text-transform:capitalize}
.al-srow-wave{width:160px;height:32px;flex-shrink:0;overflow:hidden;border-radius:4px}
.al-srow-wave img,.al-srow-wave canvas{width:100%;height:100%;object-fit:cover;display:block}
.al-still{width:100%;height:100%;object-fit:contain;display:block}
.al-srow-size{width:56px;text-align:right;font-size:12px;opacity:.6;font-variant-numeric:tabular-nums}
.al-srow-fav{background:transparent;border:0;color:inherit;font-size:16px;cursor:pointer;opacity:.7}
.al-srow-fav[aria-pressed=true]{color:#f87171;opacity:1}
.al-srow-add{padding:4px 10px}
@media (max-width:900px){.al-srow-wave{display:none}}
.al-sample{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;height:100%;padding:8px;text-align:center;background:linear-gradient(135deg,color-mix(in srgb,#4c8dff 14%,transparent),color-mix(in srgb,#8b5cf6 10%,transparent))}
.al-sample-main{font-size:34px;font-weight:700;line-height:1.1;font-family:"Noto Sans Sinhala","Noto Sans Tamil",Georgia,serif}
.al-sample.large .al-sample-main{font-size:52px}
.al-sample-name{font-size:12px;opacity:.6;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.al-card{content-visibility:auto;contain-intrinsic-size:auto 260px}
.al-fade{opacity:0;transition:opacity .18s ease-out}
.al-fade.in{opacity:1}
.al-cats{width:200px;flex-shrink:0;overflow:auto;padding:12px 8px;border-right:1px solid var(--al-border,color-mix(in srgb,currentColor 8%,transparent));display:flex;flex-direction:column;gap:2px}
.al-cat{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:6px;font-size:13px;text-align:left;color:inherit;opacity:.8;background:transparent;border:0;cursor:pointer}
.al-cat:hover{background:color-mix(in srgb,currentColor 5%,transparent);opacity:1}
.al-cat[aria-pressed=true]{background:rgba(76,141,255,.18);color:#8fb6ff;opacity:1;font-weight:600}
.al-cat-n{opacity:.55;font-variant-numeric:tabular-nums}
.al-filters{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:14px}
.al-chip{border:1px solid var(--border,#2a3040);border-radius:var(--ui-radius,5px);padding:3px 10px;background:none;color:var(--muted-foreground,#8b93a7);font:inherit;font-size:12px;cursor:pointer}
.al-chip[aria-pressed=true]{background:#4c8dff22;border-color:#4c8dff;color:#cfe0ff}
.al-sep{width:1px;height:18px;background:var(--border,#2a3040);margin:0 4px}
.al-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.al-card{border:1px solid var(--border,#232836);border-radius:var(--ui-radius,5px);background:var(--card,#11141c);overflow:hidden;cursor:pointer;display:flex;flex-direction:column;text-align:left;color:inherit;font:inherit;padding:0}
.al-card[aria-current=true]{border-color:#4c8dff;box-shadow:0 0 0 1px #4c8dff}
.al-thumb{aspect-ratio:16/9;background:repeating-conic-gradient(#161a24 0 25%,#12151d 0 50%) 0 0/16px 16px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.al-thumb img{max-width:80%;max-height:80%;object-fit:contain}
.al-thumb .ph{font-size:28px;opacity:.35}
.al-card-body{padding:10px 11px 11px;display:flex;flex-direction:column;gap:6px}
.al-card-title{font-weight:620}
.al-meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center;color:var(--muted-foreground,#8b93a7);font-size:11.5px}
.al-badge{border-radius:var(--ui-radius,5px);padding:1px 6px;font-size:11px;font-weight:600;background:#ffffff12;color:#c9cfdc}
.al-badge.installed{background:#2ec4b622;color:#7fe3d9}
.al-badge.builtin{background:#2ec4b614;color:#7fe3d9}
.al-badge.update{background:#f5a52422;color:#ffc96b}
.al-badge.pro{background:#b26bff22;color:#d6b0ff}
.al-badge.free{background:#ffffff10}
.al-badge.error{background:#e5393522;color:#ff8a87}
.al-progress{height:4px;border-radius:var(--ui-radius,5px);background:#ffffff14;overflow:hidden}
.al-progress>i{display:block;height:100%;background:#4c8dff;transition:width .2s}
.al-side{width:360px;border-left:1px solid var(--border,#232836);overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:12px;background:var(--card,#0e1118)}
.al-side h3{margin:0;font-size:16px}
.al-side p{margin:0;color:var(--muted-foreground,#9aa2b5)}
.al-preview{border-radius:var(--ui-radius,5px);overflow:hidden}
.al-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.al-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px}
.al-kv dt{color:var(--muted-foreground,#8b93a7)}
.al-kv dd{margin:0}
.al-assets{display:flex;flex-direction:column;gap:2px;max-height:240px;overflow:auto;border:1px solid var(--border,#232836);border-radius:var(--ui-radius,5px);padding:4px}
.al-asset{display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:var(--ui-radius,5px);font-size:12px}
.al-asset:hover{background:#ffffff08}
.al-banner{margin:10px 18px 0;padding:8px 12px;border-radius:var(--ui-radius,5px);background:#f5a52418;border:1px solid #f5a52444;color:#ffd48a;font-size:12.5px}
.al-banner.error{background:#e5393518;border-color:#e5393544;color:#ffaaa8}
.al-settings label{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #ffffff0a}
.al-settings select,.al-settings input[type=number]{background:var(--input,#141822);border:1px solid var(--border,#2a3040);color:inherit;border-radius:var(--ui-radius,5px);padding:4px 6px;font:inherit}
.al-dragging{opacity:.35;pointer-events:none;transition:opacity .15s}
.al-thumb{position:relative}
.al-heart{position:absolute;top:6px;right:6px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#0009;color:#ff7a90;font-size:15px;cursor:pointer;line-height:1}
.al-side .al-heart{position:static;background:#ffffff10}
.al-heart[aria-pressed=false]{color:#e8eaf0}
.al-live{font-size:11.5px;color:#7fe3d9;white-space:nowrap}
.al-hint{font-size:11.5px}
.al-history{display:flex;flex-direction:column;gap:6px}
.al-empty{padding:40px;text-align:center;color:var(--muted-foreground,#8b93a7)}
.al-entry{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px dashed var(--border,#2a3040);border-radius:var(--ui-radius,5px);font-size:12px;color:var(--muted-foreground,#9aa2b5)}

.me-body{flex:1;display:grid;grid-template-columns:240px 1fr 330px;min-height:0}
.me-list,.me-props{overflow:auto;padding:14px;border-right:1px solid var(--border,#232836)}
.me-props{border-right:0;border-left:1px solid var(--border,#232836);display:flex;flex-direction:column;gap:14px}
.me-stage{display:flex;flex-direction:column;min-width:0;min-height:0}
.me-canvas-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;min-height:0;background:repeating-conic-gradient(#141821 0 25%,#10131b 0 50%) 0 0/20px 20px}
.me-canvas-wrap canvas{max-width:100%;max-height:100%;box-shadow:0 10px 40px #0008}
.me-transport{display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--border,#232836)}
.me-transport input[type=range]{flex:1;accent-color:#4c8dff}
.me-time{font-variant-numeric:tabular-nums;color:var(--muted-foreground,#8b93a7);font-size:12px;min-width:84px;text-align:right}
.me-group{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground,#7d859a);margin:10px 0 6px}
.me-item{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;color:inherit;font:inherit;padding:6px 8px;border-radius:var(--ui-radius,5px);cursor:pointer;text-align:left}
.me-item:hover{background:#ffffff08}
.me-item[aria-current=true]{background:#4c8dff22;color:#dbe7ff}
.me-item .k{font-size:10px;border-radius:var(--ui-radius,5px);padding:1px 5px;background:#ffffff12;color:#aab2c5}
.me-item .eye{margin-left:auto;opacity:.6;border:0;background:none;color:inherit;cursor:pointer;padding:0 2px}
.me-item .eye[aria-pressed=false]{opacity:.25}
.me-section{border:1px solid var(--border,#232836);border-radius:var(--ui-radius,5px);padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--card,#0f121a)}
.me-section h4{margin:0;font-size:12.5px;font-weight:650}
.me-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted-foreground,#9aa2b5)}
.me-field input[type=text],.me-field select,.me-field input[type=number]{background:var(--input,#141822);border:1px solid var(--border,#2a3040);color:var(--foreground,#e8eaf0);border-radius:var(--ui-radius,5px);padding:6px 8px;font:inherit;font-size:13px}
.me-field input[type=range]{accent-color:#4c8dff}
.me-field input,.me-field select{min-width:0;width:100%}
.me-props{overflow-x:hidden}
.me-two>*{min-width:0}
.me-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.me-colors{display:flex;flex-direction:column;gap:6px}
.me-color{display:flex;align-items:center;gap:8px;font-size:12px}
.me-color input[type=color]{width:28px;height:22px;border:1px solid var(--border,#2a3040);border-radius:var(--ui-radius,5px);background:none;padding:0;cursor:pointer}
.me-swatches{display:flex;gap:5px;flex-wrap:wrap}
.me-swatch{width:18px;height:18px;border-radius:var(--ui-radius,5px);border:1px solid #ffffff30;cursor:pointer;padding:0}
.me-langs{display:flex;gap:4px}
.me-avatar{display:flex;gap:10px;align-items:center}
.me-avatar .pic{width:56px;height:56px;border-radius:var(--ui-radius,5px);background:#596070 center/cover;flex:none;border:2px solid #f5a524}
.me-hint{font-size:11.5px;color:var(--muted-foreground,#7d859a)}

/* Light theme: next-themes drops the "dark" class. Accent text tones are
   tuned for dark surfaces, so they get darker equivalents here. */
html:not(.dark) .al-thumb{background:repeating-conic-gradient(#eef0f4 0 25%,#e4e7ed 0 50%) 0 0/16px 16px}
html:not(.dark) .al-chip[aria-pressed=true]{color:#1d4fbf}
html:not(.dark) .al-cat[aria-pressed=true]{color:#1d4fbf}
html:not(.dark) .al-badge{background:#0f172a0f;color:#334155}
html:not(.dark) .al-badge.installed,html:not(.dark) .al-badge.builtin{color:#0f766e}
html:not(.dark) .al-badge.update{color:#b45309}
html:not(.dark) .al-badge.pro{color:#7e22ce}
html:not(.dark) .al-badge.error{color:#b91c1c}
html:not(.dark) .al-banner{color:#92400e}
html:not(.dark) .al-banner.error{color:#991b1b}
html:not(.dark) .al-live{color:#0f766e}
html:not(.dark) .al-heart{background:#ffffffd9;color:#e11d48}
html:not(.dark) .al-heart[aria-pressed=false]{color:#334155}
html:not(.dark) .al-menu{box-shadow:0 12px 40px rgba(15,23,42,.18)}
html:not(.dark) .me-item[aria-current=true]{color:#1d4fbf}
html:not(.dark) .me-item .k{background:#0f172a0f;color:#475569}
`;
