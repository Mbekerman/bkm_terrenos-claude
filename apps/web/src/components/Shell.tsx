import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { useDocumentos, useProcessos } from '../lib/api';
import { contarAlertasDocs } from '../lib/regras';
import { Avatar, Icon, Marca, type NomeIcone } from './ui';
import NovaOferta from './NovaOferta';

const NAV: [string, string, NomeIcone][] = [
  ['/', 'Início', 'home'],
  ['/terrenos', 'Terrenos', 'layers'],
  ['/negociacoes', 'Negociações', 'board'],
  ['/documentos', 'Documentos', 'doc'],
];

export default function Shell() {
  const { membro, empresas, empresa, trocarEmpresa } = useSessao();
  const [nova, setNova] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const processos = useProcessos().data ?? [];
  const docs = useDocumentos().data ?? [];
  const ativos = processos.filter((p) => p.status === 'ativo');
  const alertas = contarAlertasDocs(docs, ativos);
  const cont: Record<string, number | undefined> = {
    '/terrenos': processos.length,
    '/negociacoes': ativos.length,
    '/documentos': alertas,
  };

  function buscar(v: string) {
    setQ(v);
    nav(`/terrenos?q=${encodeURIComponent(v)}`, { replace: loc.pathname === '/terrenos' });
  }

  return (
    <>
      <header className="top">
        <div className="top-in">
          <NavLink to="/" className="brand" aria-label="Início" style={{ textDecoration: 'none' }}>
            <Marca />
            <span className="brand-sep" />
            <span className="brand-prod">Terrenos</span>
          </NavLink>
          <label className="search" htmlFor="q-top">
            <Icon n="search" />
            <input id="q-top" type="search" value={q} onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar terreno, bairro, matrícula ou corretor" autoComplete="off" />
          </label>
          <div className="top-right">
            <span className="chip">{membro?.papel === 'gestor' ? 'Gestor' : 'Analista'}</span>
            <button className="iconbtn" title="Sair" aria-label="Sair" onClick={() => supabase.auth.signOut()}>
              <Icon n="logout" />
            </button>
            <Avatar nome={membro?.nome} />
          </div>
        </div>
      </header>
      <div className="layout">
        <aside className="side" aria-label="Navegação">
          <button className="compose" onClick={() => setNova(true)}><Icon n="add" s={24} />Nova oferta</button>
          {NAV.map(([to, l, i]) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-item"
                style={{ textDecoration: 'none' }}>
              <Icon n={i} />{l}
              {cont[to] != null && <span className={`cnt ${to === '/documentos' && alertas ? 'alert' : ''}`}>{cont[to]}</span>}
            </NavLink>
          ))}
          <div className="side-foot">
            {empresas.length > 1 ? (
              <label className="emp" style={{ padding: 0 }}>Empresa
                <select value={empresa?.id} onChange={(e) => trocarEmpresa(e.target.value)}>
                  {empresas.map((v) => <option key={v.empresa_id} value={v.empresa_id}>{v.empresas.nome}</option>)}
                </select>
              </label>
            ) : <span>{empresa?.nome}</span>}
          </div>
        </aside>
        <main className="main"><Outlet context={{ abrirNovaOferta: () => setNova(true) }} /></main>
      </div>
      <nav className="bnav" aria-label="Navegação">
        {NAV.map(([to, l, i]) => (
          <NavLink key={to} to={to} end={to === '/'} style={{ textDecoration: 'none' }}
>
            <span className="pill"><Icon n={i} s={22} />{to === '/documentos' && alertas > 0 && <span className="badge">{alertas}</span>}</span>{l}
          </NavLink>
        ))}
      </nav>
      <button className="fab" onClick={() => setNova(true)}><Icon n="add" s={22} />Nova oferta</button>
      {nova && <NovaOferta onFechar={() => setNova(false)} />}
    </>
  );
}

export interface ShellCtx { abrirNovaOferta: () => void }
