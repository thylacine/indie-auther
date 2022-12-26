#!/bin/bash
if [[ $# -ne 2 ]]
then
	echo "Usage: $(basename "$0") engine schema-version"
	exit 64 # EX_USAGE
fi
engine="$1"
schema="$2"
base="$(dirname "$0")/.."
pwd="$(pwd)"
src=$(realpath --relative-to "${pwd}" "${base}/src/db/${engine}/sql/schema/${schema}/er.dot")
dst=$(realpath --relative-to "${pwd}" "${base}/documentation/media/${engine}-er.svg")
if [[ ! -e "${src}" ]]
then
	echo "Missing: ${src}" 1>&2
	exit 65 # EX_DATAERR
fi
dot -Tsvg -o"${dst}" "${src}"
