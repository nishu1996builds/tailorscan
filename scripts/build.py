#!/usr/bin/env python3
"""Builds the static TailorScan site into dist/. No dependencies beyond the standard library."""
import html
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA, SRC, DIST = ROOT / "data", ROOT / "src", ROOT / "dist"

site = json.loads((DATA / "site.json").read_text())
roles = json.loads((DATA / "roles.json").read_text())
skills = json.loads((DATA / "skills.json").read_text())
BASE = (("https://" + site["custom_domain"]) if site.get("custom_domain") else site["base_url"]).rstrip("/")
NAME = site["name"]
e = html.escape
pages = []  # (path, priority) for the sitemap


from datetime import datetime, timezone
LAUNCH = bool(site.get("launch_code")) and datetime.fromisoformat(site.get("launch_ends", "2000-01-01T00:00:00+00:00")) > datetime.now(timezone.utc)
LAUNCH_ENDS_TXT = datetime.fromisoformat(site["launch_ends"]).strftime("%B %-d") if LAUNCH else ""


def kit_buy_button(label=None, cls="btn primary big"):
    if LAUNCH and not label:
        label = f"Get {site['kit_name']}, {site['launch_price']} (launch price)"
    label = label or f"Get {site['kit_name']}, {site['kit_price']}"
    if site.get("kit_url"):
        href = site["kit_url"] + ("/" + site["launch_code"] if LAUNCH else "")
        return (f'<a class="{cls}" href="{e(href)}" data-track="buy" data-full="{e(site["kit_url"])}" '
                f'data-full-label="{e("Get " + site["kit_name"] + ", " + site["kit_price"])}">{e(label)}</a>')
    if site.get("support_email"):
        return f'<a class="{cls}" href="mailto:{e(site["support_email"])}?subject=Notify%20me%20when%20the%20kit%20launches">Get notified at launch</a>'
    return f'<span class="{cls}" aria-disabled="true">Launching soon</span>'


def layout(path, title, description, body, depth, schema=None, active="", root=None):
    root = ("../" * depth) if root is None else root
    canonical = BASE + "/" + path
    pages.append(path)
    nav = [("", "Scanner"), ("keywords/", "Keywords by role"), ("kit/", site["kit_name"])]
    nav_html = "".join(
        f'<a href="{root}{p}"{" aria-current=page" if p == active else ""}>{e(t)}</a>' for p, t in nav
    )
    ld = f'<script type="application/ld+json">{json.dumps(schema)}</script>' if schema else ""
    gc = ""
    if site.get("goatcounter_code"):
        gc = (f'<script data-goatcounter="https://{e(site["goatcounter_code"])}.goatcounter.com/count" '
              'async src="//gc.zgo.at/count.js"></script>')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(canonical)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:image" content="{BASE}/assets/kit-cover.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{root}assets/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="{root}assets/style.css">
{ld}
</head>
<body data-root="{root}">
<header class="site"><div class="wrap"><a class="brand" href="{root}"><svg width="28" height="28" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#1F6F5C"/><path d="M19 12h19l9 9v27a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="#fff"/><path d="M38 12v7a2 2 0 0 0 2 2h7" fill="#CDEBE0"/><rect x="21" y="24" width="14" height="3.2" rx="1.6" fill="#B9DCCF"/><rect x="21" y="31" width="20" height="3.2" rx="1.6" fill="#B9DCCF"/><circle cx="44" cy="44" r="12" fill="#8FE0C6" stroke="#1F6F5C" stroke-width="3"/><path d="M38.5 44.2l3.8 3.8 7.4-7.6" fill="none" stroke="#0F3D33" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>{e(NAME)}</a><nav class="main">{nav_html}</nav></div></header>
<main>
{body}
</main>
<footer class="site"><div class="wrap"><div>&copy; {site['year']} {e(NAME)}. Your resume never leaves your browser.</div>
<div class="row"><a href="{root}privacy/">Privacy</a><a href="{root}jobscan-alternative/">Free Jobscan alternative</a><a href="{root}keywords/">Resume keywords</a></div></div></footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>(function(){{try{{var q=new URLSearchParams(location.search),u={{}};["utm_source","utm_medium","utm_campaign","utm_content"].forEach(function(k){{if(q.get(k))u[k]=q.get(k);}});
if(Object.keys(u).length)sessionStorage.setItem("ts_utm",JSON.stringify(u));u=JSON.parse(sessionStorage.getItem("ts_utm")||"{{}}");
if(!Object.keys(u).length)return;window.TS_UTM=u;document.querySelectorAll('a[href*="gumroad.com"]').forEach(function(a){{var x=new URL(a.href);Object.keys(u).forEach(function(k){{x.searchParams.set(k,u[k]);}});a.href=x.toString();}});}}catch(e){{}}}})();</script>
<script>(function(){{var end=Date.parse("{site.get('launch_ends','')}");if(!end||Date.now()<end)return;
document.querySelectorAll("[data-full]").forEach(function(a){{a.href=a.getAttribute("data-full");a.textContent=a.getAttribute("data-full-label");}});
document.querySelectorAll(".launch").forEach(function(x){{x.style.display="none";}});}})();</script>
{gc}
</body>
</html>
"""


def write(path, content):
    out = DIST / path
    if path.endswith("/") or path == "":
        out = out / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content)


def faq_schema(qas):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qas]}


def faq_html(qas):
    return '<div class="faq">' + "".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q, a in qas) + "</div>"


def role_links(depth, limit=None):
    root = "../" * depth
    items = roles[:limit] if limit else roles
    return '<ul class="role-grid">' + "".join(
        f'<li><a href="{root}keywords/{r["slug"]}/">{e(r["title"])}</a></li>' for r in items) + "</ul>"


# ---------- assets ----------
if DIST.exists():
    shutil.rmtree(DIST)
shutil.copytree(SRC / "assets", DIST / "assets")
example = {"resume": (ROOT / "tests/fixtures/resume.txt").read_text(), "jd": (ROOT / "tests/fixtures/jd.txt").read_text()}
kit_js = {"name": site["kit_name"], "price": site["kit_price"], "url": site.get("kit_url", ""), "page": "kit/",
          "launch_price": site.get("launch_price", "") if LAUNCH else "", "launch_ends": site.get("launch_ends", ""), "free_url": site.get("free_url", "")}
(DIST / "assets/data.js").write_text(
    "window.TS_SKILLS=" + json.dumps(skills, separators=(",", ":")) + ";\n"
    "window.TS_EXAMPLE=" + json.dumps(example) + ";\n"
    "window.TS_KIT=" + json.dumps(kit_js) + ";\n")

# ---------- home ----------
home_faq = [
    ("Is this ATS resume scanner really free?", f"Yes. The scanner is free with no sign-up and no scan limits. {NAME} is funded by an optional paid {site['kit_name']} of templates and scripts. You never need it to use the scanner."),
    ("Is my resume uploaded anywhere?", "No. Parsing and scoring run in your browser with JavaScript. Your resume and the job description are never sent to a server, and you can turn off your internet after the page loads to confirm it."),
    ("How is the match score calculated?", "About half the score comes from hard skills and tools in the posting, weighted by whether they appear under required or preferred qualifications. The rest covers soft skills, certifications, job title, other repeated phrases, and resume best practices like quantified bullets and standard headings."),
    ("What score should I aim for?", "Aim for 75 or higher on roles you really fit. Past about 85, extra keywords give diminishing returns, and a recruiter reading your resume matters more than the ATS."),
    ("Does a high score guarantee I pass the ATS?", "No tool can guarantee that. Each ATS (Workday, Greenhouse, Lever, iCIMS, Taleo) parses and ranks differently, and many rely on recruiters searching by keyword. Matching the posting's language and using a clean layout gives you the best odds across all of them."),
    ("Which file types can I upload?", "PDF, DOCX, and TXT. If a PDF produces almost no text, it is probably a scanned image, and many ATS parsers cannot read it either. Export a text-based PDF from Word or Google Docs."),
]
home = f"""
<section class="hero"><div class="wrap">
<h1>See exactly which keywords your resume is missing for this job.</h1>
<p class="lede">Paste your resume and a job description. {NAME} scores the match the way applicant tracking systems do, lists every missing skill by priority, and flags the formatting mistakes that get resumes filtered out.</p>
<div class="trust"><span>Free, unlimited scans</span><span>No sign-up</span><span>Runs in your browser, nothing uploaded</span></div>
</div></section>
<section class="wrap" id="scanner">
<div class="grid2">
<div class="card"><label class="lbl" for="resume">Your resume <small>paste text or upload</small></label>
<textarea id="resume" placeholder="Paste your full resume text here, or upload a PDF or DOCX below."></textarea>
<div class="row" style="margin-top:10px"><span class="btn small file">Upload PDF, DOCX, or TXT<input type="file" id="file" accept=".pdf,.docx,.txt,.md"></span></div>
<div class="status" id="resume-status"></div></div>
<div class="card"><label class="lbl" for="jd">Job description <small>paste the full posting</small></label>
<textarea id="jd" placeholder="Paste the entire job posting, including the requirements and qualifications sections."></textarea>
<input type="text" id="title" placeholder="Job title (optional, we detect it automatically)" style="margin-top:10px" aria-label="Job title">
<div class="status" id="jd-status"></div></div>
</div>
<div class="actions"><button class="btn primary big" id="scan">Scan my resume</button><button class="btn" id="example">Try an example</button><button class="btn" id="clear">Clear</button></div>
<div id="results" class="hidden" aria-live="polite"></div>
</section>
<section class="wrap narrow prose">
<h2>How it works</h2>
<ol><li><b>Paste or upload.</b> Your resume is read in the browser the way an ATS parser reads it. If the text comes out garbled, the ATS will see it garbled too.</li>
<li><b>We read the posting like a recruiter.</b> {NAME} finds about 240 skills, tools, and certifications across marketing, data, engineering, product, sales, finance, HR, design, and healthcare. It weights them by whether they sit under required or preferred qualifications, and ignores benefits and legal boilerplate.</li>
<li><b>You get a prioritized fix list.</b> Missing keywords come ranked by impact, with where to add each one. Then nine best-practice checks cover contact info, quantified results, action verbs, weak phrasing, and parse-friendly formatting.</li></ol>
{f'''<div class="cta"><h3>Free: the 15-minute resume tailoring checklist</h3><p style="margin:0 0 14px">The one-page routine for tailoring any resume to any posting: 5 steps, the bullet formula, and ATS-safe formatting rules. Free PDF, delivered by email.</p><a class="btn primary" href="{e(site["free_url"])}" data-track="free-checklist">Get the free checklist</a></div>''' if site.get("free_url") else ""}
<h2>Keyword guides by role</h2>
<p>No job description handy? Start with the keywords recruiters search for in your field.</p>
{role_links(0, 12)}
<p><a href="keywords/">See all {len(roles)} role guides</a></p>
<h2>Frequently asked questions</h2>
{faq_html(home_faq)}
</section>
<script src="assets/engine.js"></script><script src="assets/data.js"></script><script src="assets/app.js"></script>
"""
app_schema = {"@context": "https://schema.org", "@type": "WebApplication", "name": NAME, "url": BASE + "/",
              "applicationCategory": "BusinessApplication", "operatingSystem": "Any",
              "description": "Free resume vs job description keyword scanner that runs in your browser.",
              "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}
write("", layout("", f"Free ATS Resume Scanner: Match Your Resume to Any Job | {NAME}",
                 "Free ATS resume checker. Compare your resume to a job description, see missing keywords by priority, and fix formatting issues. No sign-up, nothing uploaded.",
                 home, 0, [app_schema, faq_schema(home_faq)], active=""))

# ---------- role pages ----------
for r in roles:
    t = r["title"]
    jd_lines = [t, "", "Responsibilities"] + [f"- {k}" for k in r["hard"][:6]]
    jd_lines += ["", "Requirements"] + [f"- Experience with {k}" for k in r["hard"][6:] + r["tools"][:6]]
    jd_lines += [f"- Strong {s.lower()}" for s in r["soft"][:3]]
    jd_lines += ["", "Preferred qualifications"] + [f"- {c}" for c in r["certs"]] + [f"- Familiarity with {k}" for k in r["tools"][6:]]
    (DIST / "keywords" / r["slug"]).mkdir(parents=True, exist_ok=True)
    (DIST / "keywords" / r["slug"] / "jd.txt").write_text("\n".join(jd_lines) + "\n")

    def ul(items, cls="kw-list"):
        return f'<ul class="{cls}">' + "".join(f"<li>{e(i)}</li>" for i in items) + "</ul>"
    qas = [
        (f"What keywords should a {t} resume include?",
         f"The most common are {', '.join(r['hard'][:6])}, plus tools like {', '.join(r['tools'][:4])}. Always mirror the exact wording of the posting you are applying to."),
        (f"How many keywords should I add to my {t} resume?",
         "Cover every required skill you really have, and most of the preferred ones. Use each important keyword in your skills section and in at least one bullet that shows the result."),
        (f"What certifications help a {t} resume?", f"Commonly requested: {', '.join(r['certs'])}. List them exactly as the posting names them."),
    ]
    others = [x for x in roles if x["slug"] != r["slug"]][:8]
    body = f"""
<section class="hero"><div class="wrap narrow"><h1>{e(t)} resume keywords for {site['year']}</h1>
<p class="lede">{e(r['blurb'])}</p>
<div class="row" style="margin-top:18px"><a class="btn primary big" href="../../#role={r['slug']}">Scan my resume against a {e(t)} posting</a></div>
</div></section>
<section class="wrap narrow prose">
<h2>Core skills and keywords</h2>{ul(r['hard'])}
<h2>Tools and platforms recruiters search for</h2>{ul(r['tools'])}
<h2>Soft skills to show (not just list)</h2>{ul(r['soft'])}
<p>Soft skills carry more weight as evidence than as claims. Instead of "strong communicator", write a bullet where the communication produced a result.</p>
<h2>Certifications and credentials</h2>{ul(r['certs'])}
<h2>Example bullets that hit the keywords</h2>
{''.join(f'<p class="example">{e(b)}</p>' for b in r['bullets'])}
<p class="muted">The pattern: strong verb, what you did with which tool, and a measurable result. Swap in your own real numbers.</p>
<h2>Common mistakes on {e(t)} resumes</h2>{ul(r['mistakes'], '')}
<div class="cta"><h3>Check your resume against a real posting</h3><p style="margin:0 0 14px">Paste a {e(t)} job description into the free scanner to see exactly which of these keywords you are missing. It takes about 30 seconds and runs entirely in your browser.</p>
<a class="btn primary" href="../../#role={r['slug']}">Open the scanner</a></div>
<h2>FAQ</h2>{faq_html(qas)}
<h2>Other roles</h2>
<ul class="role-grid">{''.join(f'<li><a href="../{o["slug"]}/">{e(o["title"])}</a></li>' for o in others)}</ul>
</section>"""
    write(f"keywords/{r['slug']}/", layout(
        f"keywords/{r['slug']}/", f"{t} Resume Keywords ({site['year']}): Skills, Tools, and ATS Tips | {NAME}",
        f"The {t} resume keywords recruiters and ATS filters look for: core skills, tools, certifications, and example bullets. Free scanner included.",
        body, 2, faq_schema(qas), active="keywords/"))

hub = f"""<section class="hero"><div class="wrap narrow"><h1>Resume keywords by role</h1>
<p class="lede">The skills, tools, and certifications that recruiters search for in each field, with example bullets and the mistakes that get resumes skipped.</p></div></section>
<section class="wrap narrow prose">{role_links(1)}
<p>Every posting is different, so these guides are a starting point. For the exact gaps, paste the real job description into the <a href="../">free scanner</a>.</p></section>"""
write("keywords/", layout("keywords/", f"Resume Keywords by Job Title ({site['year']}) | {NAME}",
                          "ATS resume keywords for data, marketing, product, engineering, sales, finance, HR, design, and healthcare roles.", hub, 1, active="keywords/"))

# ---------- kit sales page ----------
kit_faq = [
    ("What format are the files?", "Resume, cover letter, and script templates are Word (.docx) files that also open in Google Docs and Pages. The tracker is an Excel (.xlsx) file that works in Google Sheets. The playbook is a PDF."),
    ("Are the resume templates really ATS-safe?", f"Yes. They use a single column, standard headings, real text (no images or text boxes), and common fonts. You can confirm by uploading your finished resume to the free {NAME} scanner and checking that the text comes out clean."),
    ("Is this a subscription?", "No. You pay once, download the files, and keep them. Updates to the kit are free."),
    ("What if it is not useful to me?", "Email within 30 days for a full refund. No forms, no questions."),
]
kit = f"""<section class="hero"><div class="wrap narrow"><h1>{e(site['kit_name'])}: the system behind a faster job search</h1>
<p class="lede">The free scanner shows what is missing. The kit gives you a repeatable process for every application: clean templates, a 15-minute tailoring routine, a tracker that tells you when to follow up, and the exact words to use when you reach out.</p>
<div class="row" style="margin-top:18px">{kit_buy_button()}<span class="muted">One-time payment. Instant download. 30-day refund.</span></div>
</div></section>
<section class="wrap narrow prose">
<h2>What is inside</h2>
<div class="card"><ol>
<li><b>3 ATS-safe resume templates</b> (Classic, Modern, Senior). Single-column Word files that parse cleanly in Workday, Greenhouse, Lever, and iCIMS, with guidance written into each section.</li>
<li><b>The Tailoring Playbook</b> (PDF). A 15-minute routine for tailoring a resume to any posting, the bullet formula recruiters respond to, 150+ action verbs by category, and before-and-after rewrites.</li>
<li><b>Job Application Tracker</b> (Excel and Google Sheets). Log each application and it calculates follow-up dates, flags stale applications, and charts your funnel from applied to offer.</li>
<li><b>Outreach and follow-up scripts</b>. Referral asks, recruiter cold messages, hiring manager notes, post-application and post-interview follow-ups, and offer negotiation emails.</li>
<li><b>Screening question answer frameworks</b>. Structures and examples for 25 common application and phone-screen questions, including salary expectations and "why are you leaving".</li>
<li><b>Cover letter template</b> with three opening styles and a fill-in structure that takes about 10 minutes.</li>
</ol></div>
<h2>Who it is for</h2>
<ul><li>You are sending a lot of applications and hearing nothing back.</li><li>You know you should tailor each resume but it takes you an hour.</li><li>You lose track of where you applied and never follow up.</li><li>You want templates that will not get mangled by an applicant tracking system.</li></ul>
<h2>Price</h2>
<p class="price">{(f'<s class="muted" style="font-weight:400">{e(site["kit_price"])}</s> <span class="launch">{e(site["launch_price"])}</span>') if LAUNCH else e(site['kit_price'])} <span class="muted" style="font-size:1rem;font-weight:400">one time</span></p>
{f'<p class="launch"><b>Launch price through {LAUNCH_ENDS_TXT}.</b> The code {e(site["launch_code"])} is applied automatically at checkout.</p>' if LAUNCH else ''}
<p>That is less than one month of most resume-scanner subscriptions, and you keep everything.</p>
<div class="row">{kit_buy_button()}</div>
<h2>FAQ</h2>{faq_html(kit_faq)}
</section>"""
product_schema = {"@context": "https://schema.org", "@type": "Product", "name": site["kit_name"],
                  "description": "ATS-safe resume templates, a tailoring playbook, an application tracker, and outreach scripts.",
                  "offers": {"@type": "Offer", "price": site["kit_price"].lstrip("$"), "priceCurrency": "USD",
                             "availability": "https://schema.org/InStock", "url": BASE + "/kit/"}}
write("kit/", layout("kit/", f"{site['kit_name']}: ATS Resume Templates, Tracker, and Scripts | {NAME}",
                     "ATS-safe resume templates, a 15-minute tailoring playbook, an application tracker, and outreach scripts. One-time purchase.",
                     kit, 1, [product_schema, faq_schema(kit_faq)], active="kit/"))

# ---------- comparison page ----------
cmp_rows = [
    ("Resume vs. job description keyword match", "Yes", "Yes"),
    ("Missing keywords ranked by required vs. preferred", "Yes", "Varies"),
    ("Formatting and best-practice checks", "Yes, 9 checks", "Yes"),
    ("Free scans", "Unlimited", "Limited on free plan"),
    ("Account required", "No", "Yes"),
    ("Resume uploaded to a server", "No, runs in your browser", "Yes"),
    ("LinkedIn profile optimization", "No", "Yes"),
    ("Job tracker and browser extension", "Spreadsheet tracker in the paid kit", "Yes"),
]
cmp = f"""<section class="hero"><div class="wrap narrow"><h1>A free, private Jobscan alternative</h1>
<p class="lede">{NAME} does the core job of a resume scanner, comparing your resume to a posting and listing the missing keywords, with no account, no scan limits, and no upload.</p>
<div class="row" style="margin-top:18px"><a class="btn primary big" href="../">Scan my resume free</a></div></div></section>
<section class="wrap narrow prose">
<h2>How they compare</h2>
<div class="cmp-wrap"><table class="cmp"><thead><tr><th>Feature</th><th>{NAME}</th><th>Jobscan</th></tr></thead><tbody>
{''.join(f'<tr><td>{e(a)}</td><td>{e(b)}</td><td>{e(c)}</td></tr>' for a, b, c in cmp_rows)}
</tbody></table></div>
<p class="muted">Jobscan is a trademark of its owner. {NAME} is not affiliated with Jobscan. Comparison reflects publicly listed features and may change, so check their site for current plans.</p>
<h2>When Jobscan is the better choice</h2>
<p>If you want LinkedIn profile scoring, a browser extension that pulls job postings in for you, or an all-in-one subscription, Jobscan offers more features. If you want a fast, private keyword gap check you can run as often as you like, {NAME} covers that for free.</p>
<h2>Why privacy matters for resume tools</h2>
<p>A resume holds your full name, phone, email, address, and work history. {NAME} reads files with in-browser libraries and never sends the contents anywhere, so there is nothing to leak, sell, or delete later.</p>
</section>"""
write("jobscan-alternative/", layout("jobscan-alternative/", f"Free Jobscan Alternative: Private ATS Resume Scanner | {NAME}",
                                     "A free Jobscan alternative with unlimited scans, no account, and no upload. Compare your resume to any job description in your browser.", cmp, 1))

# ---------- privacy, 404 ----------
priv = f"""<section class="wrap narrow prose" style="padding-top:32px"><h1>Privacy</h1>
<p><b>Short version: your resume and job descriptions never leave your device.</b></p>
<ul><li>All parsing and scoring run in your browser with JavaScript. No resume text, file, or job description is sent to any server.</li>
<li>Your last inputs are saved in your browser's local storage so they are still there when you come back. Use the Clear button to remove them.</li>
<li>PDF and DOCX parsing libraries (pdf.js and mammoth) load from the cdnjs public CDN. They run locally and receive none of your content.</li>
<li>{"We use GoatCounter, a privacy-friendly analytics tool with no cookies and no personal data, to count page views and button clicks." if site.get("goatcounter_code") else "We do not use cookies or tracking analytics."}</li>
<li>Purchases of {e(site['kit_name'])} are processed by our payment provider, which handles your payment details under its own privacy policy. We receive your email address to deliver the files.</li></ul>
{f'<p>Questions: <a href="mailto:{e(site["support_email"])}">{e(site["support_email"])}</a></p>' if site.get("support_email") else ''}
</section>"""
write("privacy/", layout("privacy/", f"Privacy | {NAME}", f"How {NAME} handles your data: it does not. Everything runs in your browser.", priv, 1))
nf = f'<section class="wrap narrow prose" style="padding-top:40px"><h1>Page not found</h1><p><a href="{BASE}/">Go to the free scanner</a></p></section>'
(DIST / "404.html").write_text(layout("404.html", f"Not found | {NAME}", "Page not found.", nf, 0, root=BASE + "/"))
pages.remove("404.html")

# ---------- sitemap, robots ----------
(DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                  "".join(f"  <url><loc>{BASE}/{p}</loc></url>\n" for p in pages) + "</urlset>\n")
(DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")
(DIST / ".nojekyll").write_text("")
if site.get("indexnow_key"):
    (DIST / f"{site['indexnow_key']}.txt").write_text(site["indexnow_key"])
if site.get("custom_domain"):
    (DIST / "CNAME").write_text(site["custom_domain"] + "\n")

print(f"Built {len(pages)} pages into {DIST}")
if not site.get("kit_url"):
    print("WARNING: data/site.json kit_url is empty, so buy buttons show 'Launching soon'. Add your Gumroad link.", file=sys.stderr)
