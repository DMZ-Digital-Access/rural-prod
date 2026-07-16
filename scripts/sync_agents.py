#!/usr/bin/env python3
"""
Ressincroniza os agentes deste projeto a partir da biblioteca base do Squad DMZ.

A biblioteca base fica em:
  C:\\Users\\JP\\Dropbox\\_DMZ\\AI Products\\__agents-projects\\Agents\\.agents\\agents\\<handle>.md

Este projeto usa so um subconjunto (equipe enxuta, ver .agents/rules/multi-agent-workflow.md
secao "Equipe deste projeto"). Se voce editar o prompt de um agente na biblioteca base (ou
algum agente novo de la passar a fazer sentido aqui), rode este script para trazer a versao
mais recente sem precisar copiar arquivo por arquivo na mao.

Uso:
  python3 scripts/sync_agents.py                  # sincroniza todos os agentes da equipe deste projeto
  python3 scripts/sync_agents.py architect qa      # sincroniza so os handles informados
  python3 scripts/sync_agents.py --add hunter      # adiciona um agente novo da biblioteca a este projeto
  python3 scripts/sync_agents.py --list            # lista a equipe atual deste projeto
"""
import argparse
import shutil
import sys
from pathlib import Path

BASE_LIBRARY_AGENTS = Path(
    r"C:\Users\JP\Dropbox\_DMZ\AI Products\__agents-projects\Agents\.agents\agents"
)
PROJECT_AGENTS = Path(__file__).resolve().parent.parent / ".agents" / "agents"

PROJECT_TEAM = [
    "orchestrator",
    "clara",
    "pm",
    "po",
    "sm",
    "architect",
    "developer",
    "devops",
    "qa",
    "cyber_chief",
    "legal_chief",
    "db_sage",
    "ux",
]

# Removidos deliberadamente em 2026-07-16 (ver PROJECT_CONTEXT.md secao 2): squad_manager
# (Syd) e tools_orchestrator (Quantum). Ainda disponiveis na biblioteca base - para trazer
# de volta: python3 scripts/sync_agents.py --add squad_manager


def sync(handles):
    if not BASE_LIBRARY_AGENTS.is_dir():
        sys.exit(f"Biblioteca base nao encontrada em: {BASE_LIBRARY_AGENTS}")
    PROJECT_AGENTS.mkdir(parents=True, exist_ok=True)
    for h in handles:
        src = BASE_LIBRARY_AGENTS / f"{h}.md"
        if not src.is_file():
            print(f"  [AVISO] {h}: nao encontrado na biblioteca base, pulado")
            continue
        dst = PROJECT_AGENTS / f"{h}.md"
        shutil.copyfile(src, dst)
        print(f"  [OK] {h}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("handles", nargs="*", help="Handles especificos para sincronizar")
    parser.add_argument("--add", metavar="HANDLE", help="Traz um agente novo da biblioteca base")
    parser.add_argument("--list", action="store_true", help="Lista a equipe atual e sai")
    args = parser.parse_args()

    if args.list:
        print(f"Equipe deste projeto ({len(PROJECT_TEAM)} agentes):")
        for h in PROJECT_TEAM:
            present = (PROJECT_AGENTS / f"{h}.md").is_file()
            marker = "OK" if present else "FALTANDO"
            print(f"  [{marker}] {h}")
        return

    if args.add:
        print(f"Adicionando {args.add} a equipe deste projeto...")
        sync([args.add])
        print(f"Lembre de incluir '{args.add}' em PROJECT_TEAM e no roster de rules/multi-agent-workflow.md")
        return

    targets = args.handles if args.handles else PROJECT_TEAM
    print(f"Sincronizando {len(targets)} agente(s) a partir da biblioteca base...")
    sync(targets)
    print("Concluido.")


if __name__ == "__main__":
    main()
