"""Fail-closed Linux/amd64 process bounds; applied before native imports/threads."""
import ctypes
import errno
import fcntl
import os
from pathlib import Path
import platform
import resource
import stat

MEMORY = 4 * 1024 ** 3

def enforce():
    if platform.system() != 'Linux' or platform.machine() != 'x86_64' or os.getuid() != 65532:
        raise RuntimeError('requires-linux-amd64-nonroot')
    if len(list(Path('/proc/self/task').iterdir())) != 1:
        raise RuntimeError('guards-require-single-thread')
    for name in Path('/proc/self/fd').iterdir():
        try:
            fd = int(name.name)
            mode = os.fstat(fd).st_mode
            if stat.S_ISREG(mode) and fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY:
                raise RuntimeError('preopened-writable-file')
        except FileNotFoundError:
            pass
        except OSError as exc:
            if exc.errno != errno.EBADF:
                raise
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY, MEMORY))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if resource.getrlimit(resource.RLIMIT_AS) != (MEMORY, MEMORY):
        raise RuntimeError('address-space-limit-not-enforced')
    libc = ctypes.CDLL(None, use_errno=True)
    # Kernel ABI from linux/landlock.h; ABI 3 is mandatory for TRUNCATE.
    abi = libc.syscall(444, 0, 0, 1)
    if abi < 3:
        raise RuntimeError('landlock-abi3-required')
    class Rules(ctypes.Structure):
        _fields_ = [('handled_access_fs', ctypes.c_uint64)]
    rules = Rules((1 << 1) | sum(1 << bit for bit in range(4, 15)))
    fd = libc.syscall(444, ctypes.byref(rules), ctypes.sizeof(rules), 0)
    if fd < 0:
        raise RuntimeError('landlock-create-failed')
    try:
        if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.syscall(446, fd, 0) != 0:
            raise RuntimeError('landlock-restrict-failed')
    finally:
        os.close(fd)
    # Landlock covers file hierarchy writes; deny anonymous file/ring bypasses.
    # x86_64 seccomp_data: nr offset 0, arch offset 4. Kill foreign ABI calls.
    class Filter(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte), ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint32)]
    class Program(ctypes.Structure):
        _fields_ = [('len', ctypes.c_ushort), ('filter', ctypes.POINTER(Filter))]
    rows = [(0x20, 0, 0, 4), (0x15, 1, 0, 0xc000003e), (0x06, 0, 0, 0x80000000), (0x20, 0, 0, 0)]
    # Also deny x32 ABI (high syscall bit), and mount namespace/exec transitions.
    rows += [(0x45, 0, 1, 0x40000000), (0x06, 0, 0, 0x80000000)]
    for number in [319, 425, 426, 427, 59, 322, 165, 166, 272, 308, 101]:
        rows += [(0x15, 0, 1, number), (0x06, 0, 0, 0x00050000 | errno.EPERM)]
    rows += [(0x06, 0, 0, 0x7fff0000)]
    array = (Filter * len(rows))(*(Filter(*row) for row in rows))
    program = Program(len(rows), array)
    if libc.prctl(22, 2, ctypes.byref(program), 0, 0) != 0:
        raise RuntimeError('seccomp-deny-failed')
    # Real denial checks. Do not degrade to an informational receipt.
    for path in ['/tmp/fia-write-proof', '/scratch/fia-write-proof', '/opt/model/fia-write-proof']:
        try:
            probe = os.open(path, os.O_WRONLY | os.O_CREAT, 0o600)
        except OSError as exc:
            if exc.errno not in (errno.EACCES, errno.EPERM, errno.EROFS):
                raise RuntimeError('write-probe-inconclusive') from exc
        else:
            os.close(probe)
            raise RuntimeError('filesystem-writes-not-denied')
    if libc.syscall(319, b'fia-proof', 0) != -1 or ctypes.get_errno() != errno.EPERM:
        raise RuntimeError('anonymous-file-not-denied')
    return {'schema': 'fia-image-guards@1', 'addressSpaceBytes': MEMORY,
            'scratchPolicy': 'landlock-no-filesystem-writes', 'scratchBytes': 0,
            'landlockAbi': abi, 'anonymousFilesDenied': True}
