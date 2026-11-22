/* Static wrapper for the Web TV bundle: runs the real ELF next to the private
 * glibc loader, so neither the HU's glibc nor LD_LIBRARY_PATH is involved.
 * <dir>/<name> runs <dir>/RUNTIME_REL/libexec/<name> with
 * <dir>/RUNTIME_REL/lib/ld-linux-x86-64.so.2 --library-path <...>/lib. */
#define _GNU_SOURCE
#include <errno.h>
#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef RUNTIME_REL
#define RUNTIME_REL ".."
#endif

int main(int argc, char **argv) {
    char self[PATH_MAX], dir[PATH_MAX], runtime[PATH_MAX], loader[PATH_MAX], lib[PATH_MAX], real[PATH_MAX];
    ssize_t n = readlink("/proc/self/exe", self, sizeof self - 1);
    if (n <= 0) { perror("bundle-exec: /proc/self/exe"); return 127; }
    self[n] = 0;
    char name[PATH_MAX];
    snprintf(name, sizeof name, "%s", self);
    snprintf(dir, sizeof dir, "%s", dirname(self));
    char *base = basename(name);
    if (snprintf(runtime, sizeof runtime, "%s/%s", dir, RUNTIME_REL) >= (int)sizeof runtime ||
        snprintf(loader, sizeof loader, "%s/lib/ld-linux-x86-64.so.2", runtime) >= (int)sizeof loader ||
        snprintf(lib, sizeof lib, "%s/lib", runtime) >= (int)sizeof lib ||
        snprintf(real, sizeof real, "%s/libexec/%s", runtime, base) >= (int)sizeof real) {
        fputs("bundle-exec: path too long\n", stderr);
        return 127;
    }
    char **args = calloc((size_t)argc + 7, sizeof *args);
    if (!args) return 127;
    int i = 0;
    args[i++] = loader;
    args[i++] = "--library-path"; args[i++] = lib;
    args[i++] = "--argv0"; args[i++] = argc > 0 ? argv[0] : base;
    args[i++] = real;
    for (int k = 1; k < argc; ++k) args[i++] = argv[k];
    args[i] = NULL;
    execv(loader, args);
    fprintf(stderr, "bundle-exec: %s: %s\n", loader, strerror(errno));
    return 127;
}
