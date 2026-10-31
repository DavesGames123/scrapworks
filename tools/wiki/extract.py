#!/usr/bin/env python3
"""
tools/wiki/extract.py - write the Warp public surface to wiki/surface.json.

The wiki reference tables come from this file. The file comes from the Warp
source, through the parser in Warp's own tools/apidump.py. A hand-written
signature list drifts, so the wiki has none. Rerun this tool after a Warp
change, then run tools/wiki/build.py.

    python3 tools/wiki/extract.py [path/to/warp]     default: ../warp

Reachability rule: a module enters the surface through a `pub use` or a
`pub mod` in warp_sdk/src/lib.rs. A kit that is a directory contributes each
of its `pub mod` children as a module of its own.

The output keeps a Warp commit id so that a reader can see the age of the
reference. The site build does not need a Warp checkout.
"""
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
SITE = HERE.parent.parent
WARP = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else SITE.parent / "warp").resolve()

spec = importlib.util.spec_from_file_location("apidump", WARP / "tools" / "apidump.py")
ad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ad)


def rel(p):
    return str(pathlib.Path(p).resolve().relative_to(WARP))


# Doc comments carry grep hints and paths into sibling game repositories.
# Those lines help an engine author and mean nothing to a reader of the wiki.
DROP = re.compile(r"grep -n|\.\./[a-z]|^\s*warp_sdk/shaderlib/CATALOG")


def clean_doc(d):
    if not d:
        return ""
    if isinstance(d, (list, tuple)):
        d = "\n".join(d)
    return "\n".join(l.rstrip() for l in str(d).splitlines() if not DROP.search(l)).strip()


def to_items(found, home=None):
    out, seen = [], set()
    for kind, name, sig, doc, owner in found:
        key = (kind, name, sig, owner)
        if key in seen:
            continue
        seen.add(key)
        item = {"kind": kind, "name": name, "sig": sig, "doc": clean_doc(doc), "owner": owner}
        if kind in ("struct", "enum") and owner is None:
            body = type_body(name, kind, home)
            if body:
                item["body"] = body
        out.append(item)
    return out


def type_body(name, kind, home):
    """The public fields of a struct, or the variants of an enum.

    Several crates define a type with one name. Prefer the file of the
    section, then a file in its directory, then the only candidate.
    """
    files = DEFS.get((kind, name), [])
    if not files:
        return ""
    pick = None
    if home is not None:
        home = pathlib.Path(home)
        for f in files:
            if f == home:
                pick = f
        if pick is None:
            for f in files:
                if f.parent == home.parent:
                    pick = f
    if pick is None:
        if len(files) > 1:
            return ""
        pick = files[0]
    lines = pick.read_text(encoding="utf-8", errors="replace").splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(rf"\s*pub {kind} {name}\b", l)), None)
    if start is None or lines[start].rstrip().endswith(";") or "{" not in lines[start]:
        return ""
    indent = len(lines[start]) - len(lines[start].lstrip())
    out = []
    pending = []
    for l in lines[start + 1:]:
        if l.startswith(" " * indent + "}"):
            break
        s = l.strip()
        if s.startswith("///"):
            line = s[3:].strip()
            if "grep -n" not in line:
                pending.append(line)
            continue
        if s.startswith("#[") or s.startswith("//") or not s:
            continue
        keep = kind == "enum" or s.startswith("pub ")
        depth = len(l) - len(l.lstrip()) - indent
        if keep or depth > 4:
            if keep and depth == 4:
                for d in pending:
                    out.append("/// " + d)
            out.append(l[indent + 4:] if len(l) > indent + 4 else s)
        pending = []
    return "\n".join(out).rstrip()


def impl_index():
    """Map a type name to the files that hold an `impl` block for the type.

    A type often splits its methods across files. RenderContext keeps its
    draw calls in other files than the struct. apidump reads one file.
    """
    index = {}
    for root in (WARP / "warp_core/src", WARP / "warp_net/src", WARP / "warp_sdk/src"):
        for f in root.rglob("*.rs"):
            if "vendor" in f.parts or "panels/forge" in str(f):
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            for m in re.finditer(r"^impl(?:<[^>]*>)?\s+([A-Z]\w*)", text, re.M):
                index.setdefault(m.group(1), set()).add(f)
    return index


def trait_methods(path, name):
    """The method headers and doc comments of `pub trait name` in a file."""
    lines = pathlib.Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(rf"pub trait {name}\b", l)), None)
    if start is None:
        return []
    out = []
    i = start + 1
    while i < len(lines) and not lines[i].startswith("}"):
        m = re.match(r"\s{4}(?:unsafe\s+)?fn\s+([a-z_]\w*)", lines[i])
        if m:
            j, sig = i, lines[i].strip()
            while "{" not in sig and ";" not in sig and j + 1 < len(lines):
                j += 1
                sig += " " + lines[j].strip()
            sig = sig.split("{")[0].rstrip().rstrip(";")
            out.append(("fn", m.group(1), sig, ad.doc_above(lines, i), name))
        i += 1
    return out


def complete(found, index, trait_files, home=None):
    """Add the methods that live in other files, and the trait methods.

    Two kits may define a type with one name, for example two `Stage`
    types. A method then belongs to the type in its own directory, so an
    ambiguous name reads only the impl files beside the section file.
    """
    extra = []
    for kind, name, sig, doc, owner in found:
        if owner is not None:
            continue
        if kind == "struct" or kind == "enum":
            defs = DEFS.get(("struct", name), []) + DEFS.get(("enum", name), [])
            if len(set(defs)) > 1:
                if home is None:
                    continue
                base = pathlib.Path(home).parent
                files = [f for f in index.get(name, ()) if f.parent == base]
            else:
                files = index.get(name, ())
            for f in files:
                extra += [it for it in ad.items(f) if it[4] == name and it[0] == "fn"]
        if kind == "trait":
            for f in trait_files.get(name, ()):
                extra += trait_methods(f, name)
    return list(found) + extra


def sdk_foreign(path):
    """Items that an SDK kit re-exports from another crate, by module.

    apidump follows `pub use sub::x` inside one crate. A kit such as boot
    says `pub use warp_core::bootsplash::{...}`, and this reads that form.
    Returns {"": items at module level, "shot": items of `pub mod shot`}.
    """
    text = ad.strip_comments(pathlib.Path(path).read_text(encoding="utf-8", errors="replace"))
    out = {}
    current = ""
    for line_no, m in enumerate(re.finditer(
            r"(?:^\s*pub mod (\w+) \{)|(?:^\s*pub use warp_core::([\w:]+)::\{([^}]*)\})|(?:^\s*pub use warp_core::([\w:]+)::(\w+)\s*;)",
            text, re.M)):
        if m.group(1):
            current = m.group(1)
            continue
        mod = m.group(2) or m.group(4)
        names = [n.strip() for n in (m.group(3) or m.group(5)).split(",") if n.strip()]
        base = WARP / "warp_core/src"
        target = ad.module_file(base, mod.split("::"))
        if target is None:
            continue
        for n in names:
            out.setdefault(current, []).extend(ad.surface(target, {n}))
    return out


def header(path):
    """The file banner: the OVERVIEW block of a /* ... */ or //! header."""
    t = pathlib.Path(path).read_text(encoding="utf-8", errors="replace")
    m = re.match(r"\s*/\*(.*?)\*/", t, re.S)
    if not m:
        return ""
    return "\n".join(re.sub(r"^\s*\*? ?", "", l).rstrip() for l in m.group(1).splitlines()).strip()


def children(path):
    """The (name, file) pairs of the `pub mod x;` lines of a module file."""
    text = ad.strip_comments(pathlib.Path(path).read_text(encoding="utf-8", errors="replace"))
    base = ad.child_dir(pathlib.Path(path))
    out = []
    for name in re.findall(r"^\s*pub mod ([a-z_0-9]+)\s*;", text, re.M):
        for c in (base / f"{name}.rs", base / name / "mod.rs"):
            if c.exists():
                out.append((name, c))
                break
    return out


def module(name, path, sections, feature=None):
    sections[name] = {
        "name": name,
        "feature": feature,
        "file": rel(path),
        "lines": sum(1 for _ in open(path, encoding="utf-8", errors="replace")),
        "items": to_items(complete(ad.surface(pathlib.Path(path), None), INDEX, TRAITS, path), path),
        "header": "",
    }
    if str(path).endswith((".rs",)) and "warp_sdk/src" in str(path):
        for sub, found in sdk_foreign(path).items():
            found = to_items(complete(found, INDEX, TRAITS), None)
            if sub:
                sections[f"{name}::{sub}"] = {"name": f"{name}::{sub}", "feature": feature, "file": rel(path),
                                              "lines": 0, "items": found, "header": ""}
            else:
                sections[name]["items"] += found
    for child, cpath in children(path):
        module(f"{name}::{child}", cpath, sections, feature)


def main():
    global INDEX, TRAITS, DEFS
    INDEX = impl_index()
    TRAITS = {}
    DEFS = {}
    for root in (WARP / "warp_core/src", WARP / "warp_net/src", WARP / "warp_sdk/src"):
        for f in root.rglob("*.rs"):
            if "vendor" in f.parts or "panels/forge" in str(f):
                continue
            for k, n in re.findall(r"^\s*pub (struct|enum) (\w+)", f.read_text(encoding="utf-8", errors="replace"), re.M):
                DEFS.setdefault((k, n), []).append(f)
    for root in (WARP / "warp_core/src", WARP / "warp_net/src", WARP / "warp_sdk/src"):
        for f in root.rglob("*.rs"):
            if "vendor" in f.parts or "panels/forge" in str(f):
                continue
            for n in re.findall(r"^pub trait (\w+)", f.read_text(encoding="utf-8", errors="replace"), re.M):
                TRAITS.setdefault(n, set()).add(f)
    parsed = ad.parse_sdk(ad.SDK.read_text(encoding="utf-8"))
    sections = {}
    root_items = []
    for sec in parsed:
        n = (sec.name or "").replace("warp_sdk::", "")
        if sec.whole is not None:
            module(n, sec.whole, sections, sec.feature)
            continue
        found = []
        by_file = {}
        for path, name, alias in sec.picks:
            by_file.setdefault(path, []).append((name, alias))
        for path, pairs in by_file.items():
            for name, alias in pairs:
                found += [
                    (k, alias if (o is None and m == name) else m, s, d, alias if o == name else o)
                    for k, m, s, d, o in ad.surface(path, {name})
                ]
        if not n:
            root_items = to_items(complete(found, INDEX, TRAITS, WARP / "warp_core/src/lib.rs"), WARP / "warp_core/src/lib.rs")
            continue
        files = sorted({rel(p) for p in by_file})
        sections[n] = {
            "name": n, "feature": sec.feature, "file": files[0] if files else "",
            "files": files, "items": to_items(complete(found, INDEX, TRAITS, (WARP / files[0]) if files else None), (WARP / files[0]) if files else None), "header": "",
            "lines": 0, "missing": sorted(sec.missing),
        }
    # `pub mod x;` kits declared in warp_sdk itself. apidump leaves `whole`
    # empty for some of these, so read the lib.rs list here too.
    lib = ad.strip_comments(ad.SDK.read_text(encoding="utf-8"))
    for name in re.findall(r"^pub mod ([a-z_0-9]+)\s*;", lib, re.M):
        if name in sections and sections[name]["items"]:
            continue
        for c in (ad.SDK_SRC / f"{name}.rs", ad.SDK_SRC / name / "mod.rs"):
            if c.exists():
                module(name, c, sections)
                break
    sections["(root)"] = {"name": "(root)", "feature": None, "file": "warp_sdk/src/lib.rs",
                          "items": root_items, "header": "", "lines": 0}
    head = subprocess.run(["git", "-C", str(WARP), "rev-parse", "--short", "HEAD"],
                          capture_output=True, text=True).stdout.strip()
    date = subprocess.run(["git", "-C", str(WARP), "log", "-1", "--format=%cs"],
                          capture_output=True, text=True).stdout.strip()
    log = subprocess.run(["git", "-C", str(WARP), "log", "-400", "--format=%cs\t%s", "--", "warp_sdk", "warp_net", "docs"],
                         capture_output=True, text=True).stdout
    recent = []
    for line in log.splitlines():
        d, s = line.split("\t", 1)
        if re.match(r"(sdk|docs|net|hud|squircle|lit2d|shaderlib)\b", s):
            recent.append({"date": d, "subject": s})
    shaders = []
    for f in sorted((WARP / "warp_sdk" / "shaderlib").rglob("*.wgsl")):
        shaders.append({"path": str(f.relative_to(WARP / "warp_sdk" / "shaderlib")),
                        "lines": sum(1 for _ in open(f, encoding="utf-8"))})
    out = {"commit": head, "date": date, "shaders": shaders, "recent": recent[:60],
           "catalog": (WARP / "warp_sdk/shaderlib/CATALOG.md").read_text(encoding="utf-8"),
           "sections": sections}
    dest = SITE / "wiki" / "surface.json"
    dest.write_text(json.dumps(out, indent=0, ensure_ascii=False) + "\n", encoding="utf-8")
    n = sum(len(s["items"]) for s in sections.values())
    print(f"extract: {len(sections)} modules, {n} public items, {len(shaders)} shaders, warp {head} ({date})")
    return sections


if __name__ == "__main__":
    s = main()
    for k in sorted(s):
        print(f"  {k:32} {len(s[k]['items']):5}  {s[k]['file']}")
