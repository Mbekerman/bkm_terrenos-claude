"""Banco da rodada.

Produção fala com o Supabase pela API (service role): RPC no schema `app` e
o bruto em Storage, bucket `documentos`. O teste ponta a ponta usa o Postgres
local e as mesmas funções, sem PostgREST e sem projeto remoto.
"""
from __future__ import annotations

import json
import uuid
from datetime import date
from pathlib import Path

import httpx

from coletar.erros import ColetaErro

try:
    from psycopg.types.json import Jsonb
except ImportError:  # produção não instala o driver; só o teste local
    Jsonb = None


def _py(valor):
    if isinstance(valor, uuid.UUID):
        return str(valor)
    if isinstance(valor, str):
        texto = valor.strip()
        if texto.startswith("{") or texto.startswith("[") or texto.startswith('"'):
            try:
                return json.loads(texto)
            except json.JSONDecodeError:
                return valor
    return valor


class BancoSupabase:
    def __init__(self, url: str, chave: str, transporte: httpx.BaseTransport | None = None):
        if not url or not chave:
            raise ColetaErro("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios")
        self.url = url.rstrip("/")
        self.chave = chave
        self.http = httpx.Client(transport=transporte, timeout=120.0)

    def fechar(self) -> None:
        self.http.close()

    def _cabecalhos(self) -> dict:
        return {
            "apikey": self.chave,
            "Authorization": f"Bearer {self.chave}",
            "Content-Type": "application/json",
            "Content-Profile": "app",
            "Accept-Profile": "app",
        }

    def _rpc(self, nome: str, corpo: dict):
        r = self.http.post(f"{self.url}/rest/v1/rpc/{nome}", headers=self._cabecalhos(), json=corpo)
        if r.status_code >= 400:
            raise ColetaErro(f"{nome} retornou {r.status_code}: {r.text[:300]}")
        if not r.text or r.text == "null":
            return None
        return r.json()

    def _get(self, tabela: str, params: dict):
        r = self.http.get(
            f"{self.url}/rest/v1/{tabela}",
            headers=self._cabecalhos(),
            params=params,
        )
        if r.status_code >= 400:
            raise ColetaErro(f"leitura de {tabela} retornou {r.status_code}: {r.text[:300]}")
        return r.json()

    def abrir(self, empresa_id: str, fonte: str, tipo: str, referencia: date, caminho: str) -> str:
        coleta = self._rpc("abrir_coleta_mercado", {
            "p_empresa": empresa_id,
            "p_fonte": fonte,
            "p_tipo": tipo,
            "p_referencia": referencia.isoformat(),
            "p_esperados": None,
            "p_bruto_caminho": caminho,
        })
        return str(coleta).strip('"')

    def importar(self, coleta_id: str, empreendimentos: list[dict]) -> dict:
        return self._rpc("importar_mercado", {"p_coleta": coleta_id, "p_dados": empreendimentos}) or {}

    def fechar_coleta(self, coleta_id: str, esperados: int | None, *, forcar_incompleta: bool = False) -> dict:
        return self._rpc("fechar_coleta_mercado", {
            "p_coleta": coleta_id,
            "p_esperados": esperados,
            "p_forcar_incompleta": forcar_incompleta,
        }) or {}

    def anotar_falha(self, coleta_id: str, id_externo: str | None, motivo: str, detalhe: str) -> None:
        self._rpc("anotar_falha_mercado", {
            "p_coleta": coleta_id,
            "p_id": id_externo or "",
            "p_motivo": motivo,
            "p_detalhe": (detalhe or "")[:500],
        })

    def falhar(self, coleta_id: str, motivo: str) -> None:
        self._rpc("falhar_coleta_mercado", {"p_coleta": coleta_id, "p_motivo": (motivo or "")[:500]})

    def conhecidos(self, empresa_id: str, fonte: str) -> dict[str, str]:
        ids = self._get("mercado_ids_externos", {
            "select": "id_externo,entidade_id",
            "empresa_id": f"eq.{empresa_id}",
            "fonte": f"eq.{fonte}",
            "entidade": "eq.empreendimento",
        })
        if not ids:
            return {}
        situacao = {}
        ents = [row["entidade_id"] for row in ids if row.get("entidade_id")]
        for i in range(0, len(ents), 80):
            lote = ",".join(ents[i:i + 80])
            estados = self._get("mercado_empreendimento_estados", {
                "select": "empreendimento_id,situacao",
                "ate_coleta_id": "is.null",
                "empreendimento_id": f"in.({lote})",
            })
            for estado in estados:
                situacao[estado["empreendimento_id"]] = estado["situacao"]
        return {
            row["id_externo"]: situacao[row["entidade_id"]]
            for row in ids
            if row.get("id_externo") and row.get("entidade_id") in situacao
        }

    def gravar_bruto(self, caminho: str, conteudo: bytes) -> None:
        r = self.http.post(
            f"{self.url}/storage/v1/object/documentos/{caminho}",
            headers={
                "apikey": self.chave,
                "Authorization": f"Bearer {self.chave}",
                "Content-Type": "application/gzip",
                "x-upsert": "true",
            },
            content=conteudo,
        )
        if r.status_code >= 400:
            raise ColetaErro(f"storage retornou {r.status_code}: {r.text[:300]}")


class BancoPostgres:
    """Mesmas funções do schema `app`, num Postgres local. O bruto vai para a pasta e para storage.objects."""

    def __init__(self, dsn: str, pasta: Path):
        if Jsonb is None:
            raise ColetaErro("o banco local precisa de psycopg")
        import psycopg
        self.pasta = Path(pasta)
        self.conn = psycopg.connect(dsn)
        self.conn.autocommit = True
        self.conn.execute("select set_config('request.jwt.claim.role', 'service_role', false)")

    def fechar(self) -> None:
        self.conn.close()

    def abrir(self, empresa_id: str, fonte: str, tipo: str, referencia: date, caminho: str) -> str:
        row = self.conn.execute(
            "select app.abrir_coleta_mercado(%s::uuid, %s, %s, %s::date, %s::int, %s)",
            (empresa_id, fonte, tipo, referencia, None, caminho),
        ).fetchone()
        return str(row[0])

    def importar(self, coleta_id: str, empreendimentos: list[dict]) -> dict:
        row = self.conn.execute(
            "select app.importar_mercado(%s::uuid, %s::jsonb)",
            (coleta_id, Jsonb(empreendimentos)),
        ).fetchone()
        return _py(row[0]) or {}

    def fechar_coleta(self, coleta_id: str, esperados: int | None, *, forcar_incompleta: bool = False) -> dict:
        row = self.conn.execute(
            "select app.fechar_coleta_mercado(%s::uuid, %s::int, %s)",
            (coleta_id, esperados, forcar_incompleta),
        ).fetchone()
        return _py(row[0]) or {}

    def anotar_falha(self, coleta_id: str, id_externo: str | None, motivo: str, detalhe: str) -> None:
        self.conn.execute(
            "select app.anotar_falha_mercado(%s::uuid, %s, %s, %s)",
            (coleta_id, id_externo or "", motivo, (detalhe or "")[:500]),
        )

    def falhar(self, coleta_id: str, motivo: str) -> None:
        self.conn.execute(
            "select app.falhar_coleta_mercado(%s::uuid, %s)",
            (coleta_id, (motivo or "")[:500]),
        )

    def conhecidos(self, empresa_id: str, fonte: str) -> dict[str, str]:
        rows = self.conn.execute(
            """
            select i.id_externo, s.situacao
              from app.mercado_ids_externos i
              join app.mercado_empreendimento_estados s
                on s.empreendimento_id = i.entidade_id and s.ate_coleta_id is null
             where i.empresa_id = %s and i.fonte = %s and i.entidade = 'empreendimento'
            """,
            (empresa_id, fonte),
        ).fetchall()
        return {r[0]: r[1] for r in rows}

    def gravar_bruto(self, caminho: str, conteudo: bytes) -> None:
        dest = self.pasta / caminho
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(conteudo)
        self.conn.execute("delete from storage.objects where bucket_id = 'documentos' and name = %s", (caminho,))
        self.conn.execute(
            "insert into storage.objects (bucket_id, name) values ('documentos', %s)",
            (caminho,),
        )
