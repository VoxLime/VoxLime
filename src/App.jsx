import { useEffect, useMemo, useState } from "react";
import {
  Search, Menu, X, Play, Star, Flame, Sparkles, CalendarDays,
  Home, Compass, Bookmark, UserRound, ChevronRight, Languages,
  RefreshCw, Clapperboard
} from "lucide-react";

const API = "https://graphql.anilist.co";
const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural"];

const COPY = {
  en: {
    tagline: "YOUR ULTIMATE ANIME UNIVERSE", discover: "Discover your next",
    world: "anime adventure.", description: "Explore thousands of anime, discover new stories, and keep your favorites close.",
    explore: "Explore anime", trending: "Trending now", popular: "Popular anime",
    latest: "Latest releases", viewAll: "View all", search: "Search anime, genres...",
    genres: "Explore genres", home: "Home", discoverNav: "Discover", watchlist: "Watchlist",
    profile: "Profile", loading: "Loading anime...", error: "Anime data couldn't be loaded.",
    retry: "Try again", noResults: "No anime found. Try another title.",
    searchTitle: "Search results", score: "Score", episodes: "episodes",
    footer: "A universe of stories, one episode at a time."
  },
  bn: {
    tagline: "তোমার প্রিয় অ্যানিমের জগৎ", discover: "খুঁজে নাও তোমার পরবর্তী",
    world: "অ্যানিমে অ্যাডভেঞ্চার।", description: "হাজারো অ্যানিমে ঘুরে দেখো, নতুন গল্প আবিষ্কার করো, আর পছন্দের অ্যানিমে কাছে রাখো।",
    explore: "অ্যানিমে দেখো", trending: "এখন ট্রেন্ডিং", popular: "জনপ্রিয় অ্যানিমে",
    latest: "সর্বশেষ রিলিজ", viewAll: "সব দেখো", search: "অ্যানিমে বা Genre খুঁজুন...",
    genres: "Genre অনুযায়ী খুঁজুন", home: "হোম", discoverNav: "খুঁজুন", watchlist: "ওয়াচলিস্ট",
    profile: "প্রোফাইল", loading: "অ্যানিমে লোড হচ্ছে...", error: "অ্যানিমে তথ্য আনা যায়নি।",
    retry: "আবার চেষ্টা করুন", noResults: "কোনো অ্যানিমে পাওয়া যায়নি। অন্য নাম লিখুন।",
    searchTitle: "সার্চের ফলাফল", score: "রেটিং", episodes: "এপিসোড",
    footer: "প্রতিটি এপিসোডে নতুন এক গল্পের জগৎ।"
  }
};

const MEDIA_FIELDS = `
  id
  title { romaji english }
  coverImage { extraLarge large }
  bannerImage
  averageScore
  episodes
  seasonYear
  format
  genres
  description(asHtml: false)
  status
`;

async function getAnime(sort, search = "", genre = "") {
  const query = `
    query ($sort: [MediaSort], $search: String, $genre: String) {
      Page(page: 1, perPage: 18) {
        media(
          type: ANIME,
          sort: $sort,
          search: $search,
          genre: $genre,
          isAdult: false
        ) { ${MEDIA_FIELDS} }
      }
    }
  `;
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { sort: [sort], search: search || null, genre: genre || null } })
  });
  if (!response.ok) throw new Error(`AniList API error (${response.status})`);
  const json = await response.json();
  if (json.errors?.length) throw new Error(json.errors[0].message || "AniList API error");
  return json.data?.Page?.media || [];
}

function titleOf(anime) {
  return anime?.title?.english || anime?.title?.romaji || "Untitled anime";
}

function AnimeCard({ anime, onSelect, language }) {
  const t = COPY[language];
  return (
    <button className="anime-card" onClick={() => onSelect(anime)} aria-label={`Open ${titleOf(anime)}`}>
      <div className="poster-wrap">
        <img src={anime.coverImage?.extraLarge || anime.coverImage?.large} alt={titleOf(anime)} loading="lazy" />
        <span className="format-tag">{anime.format || "ANIME"}</span>
        {anime.averageScore > 0 && <span className="score"><Star size={12} fill="currentColor" /> {(anime.averageScore / 10).toFixed(1)}</span>}
        <span className="poster-hover"><Play size={20} fill="currentColor" /></span>
      </div>
      <div className="card-copy">
        <h3>{titleOf(anime)}</h3>
        <p>{anime.seasonYear || "—"} <span>•</span> {anime.episodes ? `${anime.episodes} ${t.episodes}` : (anime.status || "TBA")}</p>
      </div>
    </button>
  );
}

function Section({ title, icon: Icon, items, onSelect, language, loading, onViewAll }) {
  const t = COPY[language];
  return (
    <section className="content-section">
      <div className="section-heading">
        <div className="section-title"><span className="section-icon"><Icon size={18} /></span><h2>{title}</h2></div>
        <button className="view-all" onClick={onViewAll}>{t.viewAll}<ChevronRight size={16} /></button>
      </div>
      {loading ? <div className="anime-grid">{Array.from({length: 6}).map((_, i) => <div className="skeleton" key={i}><div/><span/></div>)}</div> :
        <div className="anime-grid">{items.slice(0, 6).map((anime) => <AnimeCard key={anime.id} anime={anime} onSelect={onSelect} language={language} />)}</div>}
    </section>
  );
}

export default function App() {
  const [language, setLanguage] = useState("en");
  const [trending, setTrending] = useState([]);
  const [popular, setPopular] = useState([]);
  const [latest, setLatest] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [genre, setGenre] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const t = COPY[language];

  async function loadHome() {
    setLoading(true);
    setError("");
    try {
      const [trendData, popularData, latestData] = await Promise.all([
        getAnime("TRENDING_DESC"),
        getAnime("POPULARITY_DESC"),
        getAnime("START_DATE_DESC")
      ]);
      setTrending(trendData);
      setPopular(popularData);
      setLatest(latestData);
    } catch (err) {
      setError(err.message || t.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadHome(); }, []);

  useEffect(() => {
    const term = search.trim();
    if (!term && !genre) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await getAnime("SEARCH_MATCH", term, genre);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, genre]);

  const heroAnime = trending[0];
  const visibleSearch = search.trim() || genre;
  const searchItems = useMemo(() => results, [results]);

  function selectGenre(value) {
    setGenre(value === genre ? "" : value);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={goTop}>
          <span className="brand-mark"><Clapperboard size={21} /></span>
          <span>VOX<span className="brand-accent">LIME</span><small>{t.tagline}</small></span>
        </a>
        <nav className={`desktop-nav ${mobileMenu ? "open" : ""}`}>
          <a className="active" href="#" onClick={goTop}>{t.home}</a>
          <a href="#trending">{t.discoverNav}</a>
          <a href="#genres">{t.genres}</a>
        </nav>
        <div className="header-actions">
          <label className="search-box">
            <Search size={17} />
            <input value={search} onChange={(e) => {setSearch(e.target.value); setGenre("");}} placeholder={t.search} />
            {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15}/></button>}
          </label>
          <button className="language-button" onClick={() => setLanguage(language === "en" ? "bn" : "en")}><Languages size={16}/>{language === "en" ? "বাংলা" : "English"}</button>
          <button className="menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu ? <X/> : <Menu/>}</button>
        </div>
      </header>

      <main>
        {visibleSearch ? (
          <section className="search-results content-section">
            <div className="section-heading"><div className="section-title"><span className="section-icon"><Search size={18}/></span><h2>{t.searchTitle}</h2></div><span className="result-count">{searching ? t.loading : `${searchItems.length} results`}</span></div>
            {searching ? <p className="status-text">{t.loading}</p> : searchItems.length ?
              <div className="anime-grid">{searchItems.map(a => <AnimeCard key={a.id} anime={a} onSelect={setSelected} language={language}/>)}</div> :
              <p className="status-text">{t.noResults}</p>}
          </section>
        ) : (
          <>
            <section className="hero">
              <div className="hero-glow"/>
              <div className="hero-content">
                <div className="eyebrow"><Sparkles size={14}/> {t.tagline}</div>
                <h1>{t.discover}<br/><span>{t.world}</span></h1>
                <p>{t.description}</p>
                <button className="primary-button" onClick={() => document.getElementById("trending")?.scrollIntoView({behavior:"smooth"})}><Compass size={17}/>{t.explore}<ChevronRight size={17}/></button>
                <div className="hero-stats"><div><strong>10K+</strong><span>Anime titles</span></div><i/><div><strong>24/7</strong><span>Discover stories</span></div></div>
              </div>
              <div className="hero-art">
                {heroAnime?.bannerImage ? <img src={heroAnime.bannerImage} alt="" /> : heroAnime?.coverImage?.extraLarge ? <img src={heroAnime.coverImage.extraLarge} alt="" /> : <div className="hero-art-placeholder"><Sparkles size={60}/></div>}
                <div className="hero-art-shade"/>
                {heroAnime && <div className="featured-label"><span>✦ FEATURED ANIME</span><strong>{titleOf(heroAnime)}</strong><small>{heroAnime.seasonYear || "Anime"} · {heroAnime.format || "Series"}</small></div>}
              </div>
              <div className="hero-orb orb-one"/><div className="hero-orb orb-two"/>
            </section>

            {error && <div className="error-panel"><p>{t.error}</p><small>{error}</small><button onClick={loadHome}><RefreshCw size={15}/>{t.retry}</button></div>}

            <div className="page-content">
              <div id="trending"><Section title={t.trending} icon={Flame} items={trending} onSelect={setSelected} language={language} loading={loading} onViewAll={() => {setSearch(" "); goTop();}} /></div>
              <Section title={t.popular} icon={Star} items={popular} onSelect={setSelected} language={language} loading={loading} onViewAll={() => {setSearch(" "); goTop();}} />
              <Section title={t.latest} icon={CalendarDays} items={latest} onSelect={setSelected} language={language} loading={loading} onViewAll={() => {setSearch(" "); goTop();}} />

              <section className="content-section" id="genres">
                <div className="section-heading"><div className="section-title"><span className="section-icon"><Compass size={18}/></span><h2>{t.genres}</h2></div></div>
                <div className="genre-list">{GENRES.map(g => <button key={g} className={`genre-chip ${genre === g ? "selected" : ""}`} onClick={() => selectGenre(g)}>{g}<ChevronRight size={14}/></button>)}</div>
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="footer"><a className="brand" href="#" onClick={goTop}><span className="brand-mark"><Clapperboard size={19}/></span><span>VOX<span className="brand-accent">LIME</span></span></a><p>{t.footer}</p><small>Anime information provided by AniList. VoxLime is an independent discovery interface.</small></footer>

      <nav className="mobile-bottom-nav">
        <button className="active" onClick={goTop}><Home size={19}/><span>{t.home}</span></button>
        <button onClick={() => document.getElementById("trending")?.scrollIntoView({behavior:"smooth"})}><Compass size={19}/><span>{t.discoverNav}</span></button>
        <button onClick={() => document.getElementById("genres")?.scrollIntoView({behavior:"smooth"})}><Bookmark size={19}/><span>{t.watchlist}</span></button>
        <button onClick={() => alert("Profile and sign-in will be added in a later development step.")}><UserRound size={19}/><span>{t.profile}</span></button>
      </nav>

      {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}>
        <div className="anime-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X/></button>
          <div className="modal-banner">{selected.bannerImage ? <img src={selected.bannerImage} alt=""/> : <img src={selected.coverImage?.extraLarge} alt=""/>}</div>
          <div className="modal-body">
            <img className="modal-poster" src={selected.coverImage?.large} alt={titleOf(selected)}/>
            <div className="modal-info"><span className="modal-kicker">{selected.format || "ANIME"} · {selected.seasonYear || "TBA"}</span><h2>{titleOf(selected)}</h2>
              <div className="modal-meta">{selected.averageScore ? <span><Star size={14} fill="currentColor"/> {(selected.averageScore/10).toFixed(1)}</span> : null}<span>{selected.episodes || "?"} {t.episodes}</span><span>{selected.status || "TBA"}</span></div>
              <p>{(selected.description || "No description available.").replace(/<[^>]*>/g, "").slice(0, 520)}</p>
              <div className="modal-genres">{(selected.genres || []).slice(0,5).map(g => <span key={g}>{g}</span>)}</div>
              <small className="source-note">Anime details from AniList. Streaming links are not provided in this first release.</small>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
