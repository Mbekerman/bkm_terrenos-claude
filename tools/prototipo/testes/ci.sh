#!/usr/bin/env bash
# Roda no CI os roteiros listados em ci.txt (os que passam no protótipo atual), em paralelo.
# Um roteiro falha se sair com erro, se imprimir uma linha "FALHA" ou se a lista de erros de página não vier vazia
# (vários roteiros antigos só imprimem, sem mudar o código de saída). Logs em saida/ci/.
# Uso: bash tools/prototipo/testes/ci.sh   (depois do build.py e do mkdemo.py; PARALELO=4 por padrão)
set -u
cd "$(dirname "$0")"
LOG=../saida/ci; rm -rf "$LOG"; mkdir -p "$LOG"
lista=$(grep -v -E '^\s*(#|$)' ci.txt)
export LOG
echo "$lista" | xargs -P "${PARALELO:-4}" -I{} bash -c '
  inicio=$(date +%s); timeout "${TEMPO:-300}" node {}.js > "$LOG/{}.log" 2>&1; cod=$?
  if [ $cod -eq 0 ] && grep -q -E "^FALHA|^ERROS:|ERROS \[[^]]|^[0-9]+ FALHA" "$LOG/{}.log"; then cod=99; fi
  echo "$cod {} $(( $(date +%s) - inicio ))s" >> "$LOG/_resultado.txt"'
falhou=$(awk '$1!=0' "$LOG/_resultado.txt" | sort -k2)
total=$(wc -l < "$LOG/_resultado.txt")
if [ -n "$falhou" ]; then
  echo "== Roteiros com falha:"; echo "$falhou"
  for t in $(echo "$falhou" | awk '{print $2}'); do echo; echo "===== $t"; grep -E "FALHA|ERROS|Error|erro" "$LOG/$t.log" | head -20; tail -5 "$LOG/$t.log"; done
  echo; echo "$(echo "$falhou" | wc -l) de $total roteiros falharam"; exit 1
fi
echo "$total roteiros, todos ok"; sort -k2 "$LOG/_resultado.txt" | awk '{print "  "$2" "$3}'
