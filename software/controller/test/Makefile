# Host-side test of the quick-glitch engine. Plain C, no SDK, any C11 compiler:
#
#   make -C software/controller/test
#
# The engine is the only part of the firmware with real logic in it, and it is
# the part that cannot be checked by eye on a badge, so it is the part that
# gets a test.

CC      ?= cc
CFLAGS  ?= -std=c11 -Wall -Wextra -Werror -O1 -g

test_glitch: test_glitch.c ../src/glitch.c ../src/glitch.h
	$(CC) $(CFLAGS) -o $@ test_glitch.c ../src/glitch.c

.PHONY: run clean
run: test_glitch
	./test_glitch

clean:
	rm -f test_glitch

.DEFAULT_GOAL := run
