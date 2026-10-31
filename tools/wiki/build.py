#!/usr/bin/env python3
"""
tools/wiki/build.py - write the Warp wiki to docs/.

Input:
    wiki/articles/*.md     one article each, with a front-matter block
    wiki/surface.json      the Warp public surface, from tools/wiki/extract.py
Output:
    docs/*.html            one static page for each article, plus index pages
    docs/data/*.json       the search index and the hover previews

Use:
    python3 tools/wiki/build.py                 write docs/
    python3 tools/wiki/build.py --lint          report only, write nothing
    python3 tools/wiki/build.py --lint SLUG...  report on those articles

The build stops with exit code 1 on a broken [[link]], a module with no home
article, a source reference to a file that Warp does not have, or a private
name in the output. An unresolved `Symbol` in an article is a lint report: it
is a warning at build time and it is an error for an article author.

Article front matter:

    ---
    title: Spring animation          page title
    short: Damped spring easing      one line, under the title
    category: Look                   one of CATEGORIES
    module: juice                    surface keys, comma separated
    example: juice                   warp_sdk/examples/NAME.rs, comma separated
    demo: spring                     docs/assets/demos/NAME.js
    see: camera, cine                slugs for the See also section
    ---

Article body extensions over Markdown:

    [[slug]]  [[slug|text]]  [[slug#Heading|text]]    internal link
    [[src:warp_sdk/src/juice.rs|pub fn spring]]       a numbered reference
    :: text                                           a hatnote line
    {{demo:NAME}}                                     a demo mount point
"""
import html
import json
import pathlib
import re
import sys
from datetime import date

import markdown

SITE = pathlib.Path(__file__).resolve().parent.parent.parent
WIKI = SITE / "wiki"
OUT = SITE / "docs"
WARP = SITE.parent / "warp"
SITE_NAME = "Warp Wiki"
TAGLINE = "From Warp Wiki, the reference for the Warp engine SDK"

CATEGORIES = [
    ("Introduction", "What Warp is, and how a game starts."),
    ("Getting started", "The entry point, the shell, and the headless proof."),
    ("Front end", "Title screens, saves, settings, type, and boot."),
    ("Look", "Colour, icons, light, post effects, camera, and feel."),
    ("Shader library", "WGSL building blocks, composed by path."),
    ("Information", "Interface surfaces that tell the player what is happening."),
    ("World and simulation", "Terrain, collision, biomes, fluid, and generation."),
    ("Game systems", "Rules and loops: enemies, economy, quests, and input."),
    ("Networking", "Peer-to-peer sessions from warp_net."),
    ("Engine", "Rendering, assets, the display, and performance."),
    ("Editor channels", "The panels that a game can feed."),
    ("Guides", "Longer recipes and standards."),
]

# Names of private repositories, hosts and people. None may reach the public
# site. The list is itself private, so it stays in a file that git ignores:
# one regular expression per line, matched without case.
PRIVATE_FILE = pathlib.Path(__file__).with_name("private.txt")
_lines = PRIVATE_FILE.read_text(encoding="utf-8").split() if PRIVATE_FILE.exists() else []
PRIVATE = re.compile("|".join(_lines), re.I) if _lines else None

ERRORS, WARNINGS = [], {}


def err(msg):
    ERRORS.append(msg)


def warn(slug, msg):
    WARNINGS.setdefault(slug, []).append(msg)


# ── Articles ────────────────────────────────────────────────────────────────


def parse(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        err(f"{path.name}: no front matter")
        return None
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    meta["slug"] = path.stem
    meta["body"] = text[m.end():]
    for key in ("module", "example", "see", "demo"):
        meta[key] = [x.strip() for x in meta.get(key, "").split(",") if x.strip()]
    if meta.get("category") not in [c for c, _ in CATEGORIES]:
        err(f"{path.name}: unknown category {meta.get('category')!r}")
    for key in ("title", "short"):
        if not meta.get(key):
            err(f"{path.name}: front matter has no {key}")
    return meta


# ── Code highlight ──────────────────────────────────────────────────────────

RUST_KW = ("as async await break const continue crate dyn else enum extern false fn for if impl in let "
           "loop match mod move mut pub ref return self Self static struct super trait true type unsafe "
           "use where while").split()
WGSL_KW = ("fn let var const struct return if else for while loop break continue switch case default "
           "true false alias override discard enable array").split()
TOKEN = re.compile(
    r"(?P<com>//[^\n]*|/\*.*?\*/)"
    r"|(?P<str>\"(?:\\.|[^\"\\])*\")"
    r"|(?P<attr>#!?\[[^\]\n]*\]|@\w+)"
    r"|(?P<life>'[a-z_]+\b(?!'))"
    r"|(?P<num>\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?(?:[a-z]+\d*)?\b)"
    r"|(?P<word>[A-Za-z_][A-Za-z0-9_]*)", re.S)


def highlight(code, lang):
    kw = set(WGSL_KW if lang == "wgsl" else RUST_KW)
    out, pos = [], 0
    for m in TOKEN.finditer(code):
        out.append(html.escape(code[pos:m.start()], quote=False))
        pos = m.end()
        t = html.escape(m.group(0), quote=False)
        kind = m.lastgroup
        if kind == "word":
            w = m.group(0)
            if w in kw:
                out.append(f'<span class="k">{t}</span>')
            elif w[0].isupper():
                out.append(f'<span class="t">{t}</span>')
            elif code[m.end():m.end() + 1] == "(":
                out.append(f'<span class="f">{t}</span>')
            else:
                out.append(t)
        else:
            cls = {"com": "c", "str": "s", "attr": "a", "life": "a", "num": "n"}[kind]
            out.append(f'<span class="{cls}">{t}</span>')
    out.append(html.escape(code[pos:], quote=False))
    return "".join(out)


FENCE = re.compile(r"^```([a-z0-9_]*)[^\n]*\n(.*?)^```\s*$", re.S | re.M)


def code_block(code, lang):
    lang = lang or "text"
    body = highlight(code, lang) if lang in ("rust", "wgsl", "toml") else html.escape(code, quote=False)
    return f'<div class="code"><button class="copy" type="button" aria-label="Copy code">Copy</button><pre><code class="lang-{lang}">{body}</code></pre></div>'


# ── Surface ─────────────────────────────────────────────────────────────────


def anchor(owner, name):
    base = f"{owner}-{name}" if owner else name
    return "sym-" + re.sub(r"[^A-Za-z0-9_-]", "-", base)


class Surface:
    def __init__(self, data):
        self.data = data
        self.sections = data["sections"]
        self.home = {}      # surface key -> slug
        self.by_slug = {}   # slug -> {"Owner::name": anchor, "name": anchor}
        self.globals = {}   # name -> [(slug, anchor, module)]

    def bind(self, articles):
        for a in articles:
            table = {}
            for key in a["module"]:
                if key not in self.sections:
                    err(f"{a['slug']}: module {key!r} is not in the surface")
                    continue
                if key in self.home:
                    err(f"{a['slug']}: module {key!r} is also claimed by {self.home[key]}")
                self.home[key] = a["slug"]
                short = key.split("::")[-1]
                for it in self.sections[key]["items"]:
                    aid = anchor(it["owner"], it["name"])
                    full = f"{it['owner']}::{it['name']}" if it["owner"] else it["name"]
                    table.setdefault(full, aid)
                    table.setdefault(it["name"], aid)
                    table.setdefault(f"{key}::{full}", aid)
                    table.setdefault(f"{short}::{full}", aid)
                    for g in {full, f"{key}::{full}", f"{short}::{full}"}:
                        self.globals.setdefault(g, []).append((a["slug"], aid, key))
            self.by_slug[a["slug"]] = table
        missing = [k for k, s in self.sections.items() if k not in self.home and s["items"]]
        for k in missing:
            err(f"surface module {k!r} has no home article")

    def resolve(self, slug, text):
        text = re.sub(r"^warp_sdk::", "", text)
        text = re.sub(r"\(.*\)$|<.*>$", "", text).strip()
        table = self.by_slug.get(slug, {})
        if text in table:
            return ("", table[text])
        hits = self.globals.get(text)
        if hits:
            slugs = {h[0] for h in hits}
            if len(slugs) == 1:
                return (hits[0][0] + ".html", hits[0][1])
        return None

    def known_anywhere(self, text):
        text = re.sub(r"^warp_sdk::", "", text)
        text = re.sub(r"\(.*\)$|<.*>$", "", text).strip()
        return text in self.globals or text in self.sections


def doc_html(text):
    if not text:
        return ""
    # A Rust doc comment indents a code block by four spaces, and the
    # paragraph above it is not always blank-line separated.
    text = re.sub(r"\n(    )", r"\n\n\1", text, count=1) if "\n    " in text else text
    text = re.sub(r"\[([^\]]+)\]\((?:crate|self|super)::[^)]*\)", r"\1", text)
    return MD.reset().convert(text)


def item_html(it, slug):
    aid = anchor(it["owner"], it["name"])
    sig = re.sub(r"\s*\{\s*$", "", it["sig"]).rstrip()
    label = f"{it['owner']}::{it['name']}" if it["owner"] else it["name"]
    body = ""
    if it.get("body"):
        body = f'<div class="code body"><pre><code class="lang-rust">{highlight(it["body"], "rust")}</code></pre></div>'
    doc = doc_html(it["doc"])
    return (f'<div class="item" id="{aid}" data-name="{html.escape(label.lower())}">'
            f'<div class="sig"><a class="anchor" href="#{aid}" aria-label="Link to {html.escape(label)}">#</a>'
            f'<code class="lang-rust">{highlight(sig, "rust")}</code></div>'
            f'{body}{doc and f"<div class=\"doc\">{doc}</div>"}</div>')


def reference_html(a, s):
    if not a["module"]:
        return "", 0
    parts, total = [], 0
    for key in a["module"]:
        sec = s.sections.get(key)
        if not sec or not sec["items"]:
            continue
        items = sec["items"]
        total += len(items)
        path = "warp_sdk" if key == "(root)" else f"warp_sdk::{key}"
        note = f' <span class="feat">feature <code>{html.escape(sec["feature"])}</code></span>' if sec.get("feature") else ""
        parts.append(f'<h3 id="mod-{re.sub(r"[^a-z0-9]", "-", key.lower())}" class="modhead"><code>{html.escape(path)}</code>{note}</h3>')
        funcs = [i for i in items if i["kind"] == "fn" and not i["owner"]]
        consts = [i for i in items if i["kind"] in ("const", "static") and not i["owner"]]
        tops = {i["name"] for i in items if not i["owner"]}
        types = [i for i in items if i["kind"] in ("struct", "enum", "trait", "type") and not i["owner"]]
        orphans = [i for i in items if i["owner"] and i["owner"] not in tops]
        if funcs:
            parts.append('<h4>Functions</h4>' + "".join(item_html(i, a["slug"]) for i in funcs))
        if types:
            parts.append('<h4>Types</h4>')
            for t in types:
                members = [i for i in items if i["owner"] == t["name"]]
                inner = "".join(item_html(i, a["slug"]) for i in members)
                count = f'{len(members)} method{"s" if len(members) != 1 else ""}'
                more = f'<details class="members"><summary>{count}</summary>{inner}</details>' if members else ""
                parts.append(f'<div class="typeblock">{item_html(t, a["slug"])}{more}</div>')
        if orphans:
            parts.append('<h4>Methods</h4>' + "".join(item_html(i, a["slug"]) for i in orphans))
        if consts:
            parts.append('<h4>Constants</h4>' + "".join(item_html(i, a["slug"]) for i in consts))
    if not total:
        return "", 0
    head = (f'<div class="reffilter"><input type="search" placeholder="Filter {total} items on this page" '
            f'aria-label="Filter items"><span class="refcount"></span></div>')
    return head + "".join(parts), total


# ── Rendering an article ────────────────────────────────────────────────────


def slugify_heading(text):
    return re.sub(r"[^a-z0-9]+", "-", html.unescape(re.sub(r"<[^>]+>", "", text)).lower()).strip("-")


MD = markdown.Markdown(extensions=["tables", "sane_lists", "attr_list"])


class Page:
    def __init__(self, a, slugs, s):
        self.a, self.slugs, self.s = a, slugs, s
        self.refs = []

    def ref(self, m):
        path, grep = m.group(1), (m.group(2) or "").strip()
        if WARP.exists():
            f = WARP / path
            if not f.exists():
                err(f"{self.a['slug']}: source reference to missing file {path}")
            elif grep and f.is_file() and grep not in f.read_text(encoding="utf-8", errors="replace"):
                err(f"{self.a['slug']}: {path} does not contain {grep!r}")
        key = (path, grep)
        if key not in self.refs:
            self.refs.append(key)
        n = self.refs.index(key) + 1
        return f'<sup class="ref"><a href="#ref-{n}" id="cite-{n}">[{n}]</a></sup>'

    def link(self, m):
        target, label = m.group(1).strip(), m.group(2)
        base, _, frag = target.partition("#")
        if base and base not in self.slugs:
            err(f"{self.a['slug']}: broken link [[{target}]]")
            return html.escape(label or target)
        text = label or (self.slugs[base]["title"] if base else frag)
        href = (f"{base}.html" if base else "") + (f"#{slugify_heading(frag)}" if frag else "")
        return f'<a href="{href}" data-slug="{base}">{html.escape(text)}</a>'

    def render(self):
        a = self.a
        src = a["body"]
        blocks = []

        def stash(m):
            blocks.append(code_block(m.group(2).rstrip("\n"), m.group(1)))
            return f"\n\nCODEBLOCK{len(blocks) - 1}X\n\n"

        src = FENCE.sub(stash, src)
        src = re.sub(r"\[\[src:([^\]|]+)(?:\|([^\]]*))?\]\]", self.ref, src)
        src = re.sub(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", self.link, src)
        src = re.sub(r"^:: (.+)$", r'<div class="hatnote">\1</div>', src, flags=re.M)
        src = re.sub(r"\{\{demo:([a-z0-9-]+)\}\}", lambda m: self.demo(m.group(1)), src)
        out = MD.reset().convert(src)
        out = re.sub(r"<p>CODEBLOCK(\d+)X</p>", lambda m: blocks[int(m.group(1))], out)
        out = out.replace("<table>", '<table class="wikitable">')
        toc = []

        def heading(m):
            lvl, text = m.group(1), m.group(2)
            sid = slugify_heading(text)
            if lvl == "2":
                toc.append((sid, re.sub(r"<[^>]+>", "", text), 2))
            elif lvl == "3":
                toc.append((sid, re.sub(r"<[^>]+>", "", text), 3))
            return f'<h{lvl} id="{sid}">{text}</h{lvl}>'

        out = re.sub(r"<h([23])>(.*?)</h\1>", heading, out)
        out = re.sub(r"<code>([^<]+)</code>", self.symbol, out)
        return out, toc

    def demo(self, name):
        if name not in self.a["demo"]:
            err(f"{self.a['slug']}: demo {name} is not in the front matter")
        return f'<div class="demo" data-demo="{name}"><noscript>This demo needs JavaScript.</noscript></div>'

    def symbol(self, m):
        raw = html.unescape(m.group(1))
        looks = re.fullmatch(r"(warp_sdk::)?[A-Za-z_][\w:]*(<[^>]*>)?(\([^)]*\))?", raw)
        if not looks:
            return m.group(0)
        hit = self.s.resolve(self.a["slug"], raw)
        if hit:
            return f'<a class="sym" href="{hit[0]}#{hit[1]}"><code>{m.group(1)}</code></a>'
        name = re.sub(r"\(.*\)$|<.*>$", "", raw)
        if name in self.s.sections or name.replace("warp_sdk::", "") in self.s.sections:
            key = name.replace("warp_sdk::", "")
            if key in self.s.home:
                return f'<a class="sym" href="{self.s.home[key]}.html"><code>{m.group(1)}</code></a>'
        if "::" in name or name[:1].isupper():
            if not self.s.known_anywhere(raw):
                warn(self.a["slug"], f"unresolved symbol `{raw}`")
        return m.group(0)


def lead(body):
    """The first prose paragraph, as plain text, for previews and search."""
    for para in re.split(r"\n\s*\n", body.strip()):
        p = para.strip()
        if not p or p.startswith(("::", "#", "```", "{{", "|", "-")):
            continue
        p = re.sub(r"\[\[src:[^\]]*\]\]", "", p)
        p = re.sub(r"\[\[[^\]|]+\|([^\]]*)\]\]", r"\1", p)
        p = re.sub(r"\[\[([^\]|#]+)[^\]]*\]\]", r"\1", p)
        p = re.sub(r"[*`]", "", p)
        return " ".join(p.split())[:420]
    return ""


def layout(title, body, *, toc=None, tabs="", desc="", extra_head="", page_class="", slug=""):
    nav = "".join(
        f'<li><a href="category-{slugify_heading(c)}.html">{html.escape(c)}</a></li>' for c, _ in CATEGORIES)
    toc_html = ""
    if toc:
        rows, open3 = [], False
        for sid, text, lvl in toc:
            if lvl == 2:
                if open3:
                    rows.append("</ul></li>")
                    open3 = False
                else:
                    rows.append("</li>") if rows else None
                rows.append(f'<li><a href="#{sid}">{html.escape(text)}</a>')
            else:
                if not open3:
                    rows.append("<ul>")
                    open3 = True
                rows.append(f'<li><a href="#{sid}">{html.escape(text)}</a></li>')
        rows.append("</ul></li>" if open3 else "</li>")
        toc_html = f'<nav class="toc" aria-label="Contents"><h2>Contents</h2><ul><li><a href="#top">(Top)</a></li>{"".join(rows)}</ul></nav>'
    meta = html.escape(desc or title, quote=True)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} - {SITE_NAME}</title>
<meta name="description" content="{meta}">
<script>try{{var t=localStorage.getItem('warp-wiki-theme');if(t)document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<link rel="stylesheet" href="assets/wiki.css">
<script src="../shared/scrap-brand.js" defer></script>
<script src="assets/wiki.js" defer></script>{extra_head}
</head>
<body class="{page_class}" data-slug="{slug}">
<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <button class="burger" type="button" aria-label="Main menu" aria-expanded="false">Menu</button>
  <a class="brand" href="index.html" aria-label="{SITE_NAME} home"><span class="brandmark" data-scrap-wordmark></span><span class="brandname"><b>Warp Wiki</b><small>The engine SDK reference</small></span></a>
  <div class="search" role="search">
    <input id="q" type="search" placeholder="Search articles and symbols" aria-label="Search {SITE_NAME}" autocomplete="off" spellcheck="false">
    <kbd>/</kbd>
    <div class="results" id="results" hidden></div>
  </div>
  <div class="tools"><a href="../index.html">Scrap home</a>
  <button class="theme" type="button" aria-label="Switch colour theme">Theme</button></div>
</header>
<div class="shell">
  <aside class="side" id="side" aria-label="Main menu">
    <div class="portal"><h2>Main menu</h2><ul>
      <li><a href="index.html">Main page</a></li>
      <li><a href="all-articles.html">All articles</a></li>
      <li><a href="symbols.html">Symbol index</a></li>
      <li><a href="shader-catalog.html">Shader catalog</a></li>
      <li><a href="recent-changes.html">Recent changes</a></li>
      <li><a href="random.html" id="rnd">Random article</a></li>
    </ul></div>
    <div class="portal"><h2>Libraries</h2><ul>{nav}</ul></div>
    {toc_html}
  </aside>
  <main id="content"><a id="top"></a>
    <h1 class="firstHeading">{title if '<' in title else html.escape(title)}</h1>
    {tabs}
    {body}
    <footer class="foot"><p>Generated from Warp commit <code>{SURF['commit']}</code> of {SURF['date']}. The reference sections come directly from the source.</p></footer>
  </main>
</div>
</body>
</html>
"""


def infobox(a, s, total):
    rows = [("Category", f'<a href="category-{slugify_heading(a["category"])}.html">{html.escape(a["category"])}</a>')]
    if a["module"]:
        paths = "<br>".join(f"<code>{html.escape('warp_sdk' if k == '(root)' else 'warp_sdk::' + k)}</code>" for k in a["module"])
        rows.append(("Module" if len(a["module"]) == 1 else "Modules", paths))
        files = []
        for k in a["module"]:
            sec = s.sections.get(k, {})
            for f in sec.get("files") or [sec.get("file")]:
                if f and f not in files:
                    files.append(f)
        rows.append(("Source", "<br>".join(f"<code>{html.escape(f)}</code>" for f in files[:6])))
        feats = {s.sections[k].get("feature") for k in a["module"] if k in s.sections} - {None}
        if feats:
            rows.append(("Feature", ", ".join(f"<code>{html.escape(f)}</code>" for f in sorted(feats))))
        if total:
            rows.append(("Public items", f'<a href="#reference">{total}</a>'))
    if a["example"]:
        rows.append(("Example", "<br>".join(f"<code>cargo run -p warp_sdk --example {html.escape(e)}</code>" for e in a["example"])))
    trs = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in rows)
    return f'<table class="infobox"><caption>{html.escape(a["title"])}</caption>{trs}</table>'


def navbox(a, articles):
    peers = [x for x in articles if x["category"] == a["category"]]
    links = " · ".join(
        f'<b>{html.escape(x["title"])}</b>' if x is a else f'<a href="{x["slug"]}.html" data-slug="{x["slug"]}">{html.escape(x["title"])}</a>'
        for x in peers)
    cats = f'<a href="category-{slugify_heading(a["category"])}.html">{html.escape(a["category"])}</a>'
    return f'<table class="navbox"><tr><th>{cats}</th></tr><tr><td>{links}</td></tr></table>'


def render_article(a, slugs, articles, s):
    page = Page(a, slugs, s)
    body, toc = page.render()
    ref, total = reference_html(a, s)
    blocks = [infobox(a, s, total) if a["module"] or a["example"] else ""]
    first_h2 = body.find("<h2")
    if first_h2 > 0:
        body = body[:first_h2] + "CONTENTSBOX" + body[first_h2:]
    else:
        body += "CONTENTSBOX"
    tail = []
    if ref:
        toc.append(("reference", "Reference", 2))
        tail.append(f'<h2 id="reference">Reference</h2><p class="refnote">This section lists every public item, as the source defines it.</p>{ref}')
    if a["see"]:
        toc.append(("see-also", "See also", 2))
        items = []
        for slug in a["see"]:
            if slug not in slugs:
                err(f"{a['slug']}: see-also slug {slug!r} does not exist")
                continue
            items.append(f'<li><a href="{slug}.html" data-slug="{slug}">{html.escape(slugs[slug]["title"])}</a></li>')
        tail.append(f'<h2 id="see-also">See also</h2><ul>{"".join(items)}</ul>')
    if page.refs:
        toc.append(("references", "References", 2))
        rows = "".join(
            f'<li id="ref-{i + 1}"><a class="back" href="#cite-{i + 1}" aria-label="Back to the text">^</a> '
            f'<code>{html.escape(p)}</code>{f" - <code>{html.escape(g)}</code>" if g else ""}</li>'
            for i, (p, g) in enumerate(page.refs))
        tail.append(f'<h2 id="references">References</h2><ol class="reflist">{rows}</ol>')
    box = ""
    body = body.replace("CONTENTSBOX", box)
    sub = f'<p class="tagline">{TAGLINE}</p><p class="shortdesc">{html.escape(a["short"])}</p>'
    tabs = (f'<div class="tabs"><a class="on" href="#top">Article</a>'
            + ('<a href="#reference">Reference</a>' if ref else "") + "</div>")
    cat = (f'<div class="catlinks"><b>Category:</b> <a href="category-{slugify_heading(a["category"])}.html">'
           f'{html.escape(a["category"])}</a></div>')
    head = "".join(f'\n<script src="assets/demos/{d}.js" defer></script>' for d in a["demo"])
    return layout(a["title"], sub + blocks[0] + body + "".join(tail) + navbox(a, articles) + cat,
                  toc=toc, tabs=tabs, desc=a["short"], extra_head=head, slug=a["slug"])


# ── Index pages ─────────────────────────────────────────────────────────────


def category_page(cat, blurb, articles):
    rows = []
    for a in articles:
        if a["category"] == cat:
            rows.append(f'<li><a href="{a["slug"]}.html" data-slug="{a["slug"]}">{html.escape(a["title"])}</a> - {html.escape(a["short"])}</li>')
    return layout(f"Category: {cat}", f'<p>{html.escape(blurb)}</p><p>This category holds {len(rows)} articles.</p><ul class="catlist">{"".join(rows)}</ul>', desc=blurb)


def all_articles(articles):
    letters = {}
    for a in sorted(articles, key=lambda x: x["title"].lower()):
        letters.setdefault(a["title"][0].upper(), []).append(a)
    body = ['<div class="azbar">' + "".join(f'<a href="#az-{k}">{k}</a>' for k in letters) + "</div>", '<div class="azcols">']
    for k, group in letters.items():
        body.append(f'<h2 id="az-{k}">{k}</h2><ul>' + "".join(
            f'<li><a href="{a["slug"]}.html" data-slug="{a["slug"]}">{html.escape(a["title"])}</a></li>' for a in group) + "</ul>")
    body.append("</div>")
    return layout("All articles", "".join(body), desc="Every article in the Warp Wiki, A to Z.")


def recent_page(data):
    days = {}
    for r in data["recent"]:
        days.setdefault(r["date"], []).append(r["subject"])
    body = ['<p>These are the latest changes to the SDK, as the commit log of Warp records them.</p>']
    for d, subs in days.items():
        body.append(f'<h2 id="d{d}">{d}</h2><ul>' + "".join(f"<li>{html.escape(s)}</li>" for s in subs) + "</ul>")
    return layout("Recent changes", "".join(body), desc="The latest changes to the Warp SDK.")


def catalog_page(data):
    src = data["catalog"]
    src = re.sub(r"^# .*\n", "", src, count=1)
    blocks = []

    def stash(m):
        blocks.append(code_block(m.group(2).rstrip("\n"), m.group(1)))
        return f"\n\nCODEBLOCK{len(blocks) - 1}X\n\n"

    src = FENCE.sub(stash, src)
    out = MD.reset().convert(src)
    out = re.sub(r"<p>CODEBLOCK(\d+)X</p>", lambda m: blocks[int(m.group(1))], out)
    out = re.sub(r"<h2>(.*?)</h2>", lambda m: f'<h2 id="{slugify_heading(m.group(1))}">{m.group(1)}</h2>', out)
    return layout("Shader catalog", '<p class="shortdesc">Every WGSL file in the shader library, grouped by family.</p>'
                  '<div class="reffilter"><input type="search" id="catq" placeholder="Filter by tag or function" aria-label="Filter the catalog"><span class="refcount"></span></div>'
                  f'<div id="catalog">{out}</div>', desc="Every WGSL file in the Warp shader library.")


def symbols_page(n):
    return layout("Symbol index",
                  f'<p class="shortdesc">Search all {n:,} public items of the SDK by name.</p>'
                  '<div class="reffilter"><input type="search" id="symq" placeholder="Type a name, for example Deck or spring" aria-label="Filter symbols"><span class="refcount"></span></div>'
                  '<table class="wikitable symtable"><thead><tr><th>Item</th><th>Kind</th><th>Module</th></tr></thead><tbody id="symrows"></tbody></table>',
                  desc="Every public item of the Warp SDK.", page_class="symbols")


def main_page(articles, data, total):
    cards = []
    for cat, blurb in CATEGORIES:
        peers = [a for a in articles if a["category"] == cat]
        if not peers:
            continue
        links = " · ".join(f'<a href="{a["slug"]}.html" data-slug="{a["slug"]}">{html.escape(a["title"])}</a>' for a in peers)
        cards.append(f'<section class="mpbox"><h2><a href="category-{slugify_heading(cat)}.html">{html.escape(cat)}</a></h2><p class="blurb">{html.escape(blurb)}</p><p>{links}</p></section>')
    src = (WIKI / "main.md").read_text(encoding="utf-8") if (WIKI / "main.md").exists() else ""
    slugs = {a["slug"]: a for a in articles}
    fake = {"slug": "index", "body": src, "demo": [], "title": ""}
    page = Page(fake, slugs, SURFACE)
    intro, _ = page.render()
    news = "".join(f"<li><b>{r['date']}</b> {html.escape(r['subject'])}</li>" for r in data["recent"][:9])
    body = (f'<div class="mpwelcome"><h2>Welcome to Warp Wiki,</h2><p>the reference for the Warp engine SDK.</p>'
            f'<p class="count"><b>{len(articles)}</b> articles · <b>{total:,}</b> documented items · <b>{len(data["shaders"])}</b> shader files</p></div>'
            f'<div class="mpgrid"><div class="mpmain">{intro}</div>'
            f'<aside class="mpnews"><section class="mpbox"><h2><a href="recent-changes.html">Recent changes</a></h2><ul>{news}</ul></section></aside></div>'
            f'<div class="mpcards">{"".join(cards)}</div>')
    return layout("Main page", body, desc="The reference for the Warp engine SDK.", page_class="mainpage")


# ── Data files ──────────────────────────────────────────────────────────────


def write_data(articles, s):
    idx = []
    for a in articles:
        idx.append({"t": a["title"], "s": a["slug"], "d": a["short"], "c": a["category"]})
    syms = []
    for key, sec in s.sections.items():
        slug = s.home.get(key)
        if not slug:
            continue
        for it in sec["items"]:
            label = f"{it['owner']}::{it['name']}" if it["owner"] else it["name"]
            syms.append([label, it["kind"], key, slug, anchor(it["owner"], it["name"])])
    previews = {a["slug"]: {"t": a["title"], "d": a["short"], "x": lead(a["body"])} for a in articles}
    (OUT / "data").mkdir(parents=True, exist_ok=True)
    (OUT / "data" / "articles.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "data" / "symbols.json").write_text(json.dumps(syms, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "data" / "previews.json").write_text(json.dumps(previews, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(syms)


def main():
    global SURF, SURFACE
    args = sys.argv[1:]
    lint = "--lint" in args
    only = [a for a in args if not a.startswith("--")]
    SURF = json.loads((WIKI / "surface.json").read_text(encoding="utf-8"))
    SURFACE = s = Surface(SURF)
    files = sorted((WIKI / "articles").glob("*.md"))
    articles = [m for m in (parse(f) for f in files) if m]
    order = {c: i for i, (c, _) in enumerate(CATEGORIES)}
    articles.sort(key=lambda a: (order.get(a["category"], 99), int(a.get("order", 50)), a["title"].lower()))
    slugs = {a["slug"]: a for a in articles}
    s.bind(articles)

    pages = {}
    for a in articles:
        pages[f"{a['slug']}.html"] = render_article(a, slugs, articles, s)
    n = sum(len(sec["items"]) for key, sec in s.sections.items() if key in s.home)
    for cat, blurb in CATEGORIES:
        pages[f"category-{slugify_heading(cat)}.html"] = category_page(cat, blurb, articles)
    pages["all-articles.html"] = all_articles(articles)
    pages["recent-changes.html"] = recent_page(SURF)
    pages["shader-catalog.html"] = catalog_page(SURF)
    pages["symbols.html"] = symbols_page(n)
    pages["index.html"] = main_page(articles, SURF, n)
    pages["random.html"] = layout("Random article", '<p>This page picks a random article. It needs JavaScript. See <a href="all-articles.html">All articles</a>.</p>', page_class="random")

    if PRIVATE is None:
        print("build: tools/wiki/private.txt is absent, so the private-name check did not run")
    else:
        texts = dict(pages)
        texts["surface.json"] = (WIKI / "surface.json").read_text(encoding="utf-8")
        for name, text in texts.items():
            for m in PRIVATE.finditer(text):
                err(f"{name}: private name {m.group(0)!r}")

    if only:
        unknown = [o for o in only if o not in slugs]
        for o in unknown:
            print(f"lint: no article {o}")
    shown = [e for e in ERRORS if not only or any(e.startswith(o + ":") for o in only)]
    if only:
        shown = [e for e in shown if "has no home article" not in e]
    for e in shown:
        print("ERROR  ", e)
    for slug, msgs in sorted(WARNINGS.items()):
        if only and slug not in only:
            continue
        for w in sorted(set(msgs)):
            print(f"WARN    {slug}: {w}")
    print(f"build: {len(articles)} articles, {n} items in articles, {len(SURF['sections'])} modules, "
          f"{len(ERRORS)} errors, {sum(len(set(v)) for v in WARNINGS.values())} warnings")
    if lint:
        sys.exit(1 if shown else 0)
    if ERRORS:
        sys.exit(1)
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.html"):
        old.unlink()
    for name, text in pages.items():
        (OUT / name).write_text(text, encoding="utf-8")
    write_data(articles, s)
    print(f"build: wrote {len(pages)} pages to {OUT.relative_to(SITE)}/ on {date.today()}")


if __name__ == "__main__":
    main()
