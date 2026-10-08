# Host-side tests of the firmware's SDK-free parts. Plain C, any C11 compiler:
#
#   make -C software/controller/test
#
# Two binaries: the quick-glitch engine (the record / replay logic) and the
# vault (the stage key's record, feature reports and stick-axis beacon). Both
# are the parts that cannot be checked by eye on a badge, so they are the
# parts that get a test.

CC      ?= cc
CFLAGS  ?= -std=c11 -Wall -Wextra -Werror -O1 -g

TESTS = test_glitch test_vault

test_glitch: test_glitch.c ../src/glitch.c ../src/glitch.h
	$(CC) $(CFLAGS) -o $@ test_glitch.c ../src/glitch.c

test_vault: test_vault.c ../src/vault.c ../src/vault.h
	$(CC) $(CFLAGS) -o $@ test_vault.c ../src/vault.c

.PHONY: run clean
run: $(TESTS)
	./test_glitch
	./test_vault

clean:
	rm -f $(TESTS)

.DEFAULT_GOAL := run
