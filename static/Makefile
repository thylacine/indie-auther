.PHONY: all

SOURCES = theme.css favicon.ico logo.svg
TARGETS = $(SOURCES:=.gz) $(SOURCES:=.br)

all: $(TARGETS)

%.br: %
	brotli --verbose --no-copy-stat --keep --force "$<"

%.gz: %
	cp "$<" "$<".tmp
	gzip "$<".tmp
	mv "$<".tmp.gz "$@"
