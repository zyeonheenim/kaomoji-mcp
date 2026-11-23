#!/usr/bin/env node
/**
 * 构建公开版数据。
 *
 * 跟私有版的区别：私有版直接用 snskeyboard 的分类（48 个韩文分类），
 * 但那份数据不能公开分发。公开版换成 kaomoji-collection（MIT 许可，41,596 条 / 535 个分类），
 * 代价是分类名全是日文罗马字（yorokobu = 喜ぶ、nemui = 眠い、mushamusha = むしゃむしゃ），
 * 所以这里要把它们映射成中文情绪层。
 *
 * 输出格式跟私有版完全一致，server.mjs 可以直接复用。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'vendor/kaomoji.json');
const OUT = path.join(ROOT, 'data/kaomoji.json');

/**
 * 情绪层：一个 mood = 一个中文概念，cats 是它对应的日文分类。
 * 顺序影响 list_categories 的展示。
 */
const MOODS = [
  {
    id: 'happy', zh: '开心', en: 'happy',
    emo: ['happy', 'joy', 'smile', 'laugh'],
    ali: ['高兴', '快乐', '愉快', '幸福', '喜悦', '哈哈', '嘿嘿', '笑', '好心情', '开心死了', '美滋滋', 'haha', 'lol', 'glad', 'cheerful'],
    cats: ['smile', 'happy', 'yorokobu', 'sumairu', 'ahaha', 'ehehe', 'uhuhu', 'kusukusu', 'nikkori', 'niconico', 'niyaniya', 'bakushou', 'tanoshii', 'waai', 'yeay'],
  },
  {
    id: 'excited', zh: '兴奋', en: 'excited',
    emo: ['excited', 'hype', '兴奋', '元气'],
    ali: ['激动', '雀跃', '期待', '超级开心', '上头', '燃', '热血', '等不及', '太棒了', 'yatta', 'hyped', 'energetic', 'thrilled'],
    cats: ['wakuwaku', 'wakuteka', 'dokidoki', 'zawazawa', 'sowasowa', 'koufun', 'tension-takai', 'morimori', 'norinori', 'banzai', 'yatta', 'ukiuki', 'waai'],
  },
  {
    id: 'love', zh: '爱心动', en: 'love',
    emo: ['love', 'heart', '爱', '心动'],
    ali: ['喜欢', '爱你', '花痴', '比心', '心里小鹿乱撞', '恋爱', '心动', '情意', 'crush', 'adore', 'romantic', 'affection'],
    cats: ['love', 'heart', 'kiss', 'kyun', 'zukyun', 'meromero', 'ichaicha', 'gyu', 'chu', 'dokidoki', 'kando'],
  },
  {
    id: 'shy', zh: '害羞', en: 'shy',
    emo: ['shy', 'embarrassed', '害羞'],
    ali: ['不好意思', '羞涩', '脸红', '腼腆', '扭捏', '装傻', '吐舌头', '被夸了', 'blush', 'bashful'],
    cats: ['shy', 'hazukashii', 'tehe', 'tehepero', 'momimomi', 'munimuni', 'magao', 'ninmari'],
  },
  {
    id: 'sad', zh: '难过', en: 'sad',
    emo: ['sad', 'sorrow', '难过', '委屈'],
    ali: ['伤心', '悲伤', '沮丧', '失落', '低落', '心痛', '难受', '郁闷', '一个人', '孤单', '寂寞', 'emo', 'sad', 'upset', 'depressed', 'lonely', 'gloomy'],
    cats: ['sad', 'shonbori', 'gakkari', 'zannen', 'tsurai', 'sabishii', 'shinmiri', 'nayamu', 'shinpai', 'fuan', 'menhera', 'uruuru', 'pien'],
  },
  {
    id: 'cry', zh: '哭', en: 'cry',
    emo: ['cry', 'tears', '哭'],
    ali: ['想哭', '眼泪', '呜呜', '泪目', '哭出来', '抽泣', '嚎啕', 'weeping', 'sob'],
    cats: ['cry', 'uruuru', 'pien', 'happy-tears', 'nakiwarai'],
  },
  {
    id: 'angry', zh: '生气', en: 'angry',
    emo: ['angry', 'rage', '生气', '愤怒'],
    ali: ['火大', '恼火', '气死', '暴怒', '哼', '不满', '翻脸', '发脾气', 'mad', 'furious', 'annoyed', 'irritated'],
    cats: ['angry', 'gao', 'punpun', 'mukatsuku', 'iraira', 'gununu', 'fuman', 'tsuntsun', 'suneru', 'abareru', 'fukurettsura', 'muu', 'buu'],
  },
  {
    id: 'annoyed', zh: '不耐烦', en: 'annoyed',
    emo: ['annoyed', '嫌', '无语'],
    ali: ['不耐烦', '嫌弃', '无语', '翻白眼', '受不了', '服了', '懒得理', '叹气', '麻烦', 'yareyare', 'ugh', 'whatever'],
    cats: ['mukatsuku', 'iraira', 'yareyare', 'akireru', 'uzai', 'mendokusai', 'dame', 'tameiki', 'fuun'],
  },
  {
    id: 'tired', zh: '累', en: 'tired',
    emo: ['tired', 'exhausted', '累'],
    ali: ['疲惫', '好累', '没劲', '精疲力尽', '不想动', '瘫', '虚脱', '熬夜', '加班', '通勤', '下班', 'drained', 'worn out'],
    cats: ['tired', 'shindoi', 'guttari', 'otsukaresama', 'yurui', 'gessori', 'guaiwarui', 'mendokusai'],
  },
  {
    id: 'sleepy', zh: '困', en: 'sleepy',
    emo: ['sleepy', 'sleep', '困'],
    ali: ['想睡', '睡觉', '打瞌睡', '睁不开眼', '好困', '躺下', '赖床', 'nap', 'drowsy', 'bedtime'],
    cats: ['nemui', 'suyaa', 'neru', 'akubi', 'goron', 'futon', 'good-night'],
  },
  {
    id: 'dead', zh: '死掉', en: 'dead',
    emo: ['dead', '死了'],
    ali: ['死了', '去世', '完蛋', '不行了', '阵亡', '毙命', '累死', '笑死', 'dead', 'rip', 'dying'],
    cats: ['shinu', 'shinikake', 'grave', 'owata', 'kizetsu', 'vomit-blood'],
  },
  {
    id: 'confused', zh: '困惑', en: 'confused',
    emo: ['confused', 'puzzled', '困惑'],
    ali: ['疑惑', '懵', '搞不懂', '什么鬼', '问号', '不解', '思考', '纠结', '犹豫', '嗯', 'what', 'huh', 'baffled', 'thinking', 'hmm'],
    cats: ['hatena', 'gimon', 'wakaranai', 'pokaan', 'kangaeru', 'nayamu', 'komaru', 'donbiki', 'gakuburu', 'fumufumu', 'naruhodo', 'konwaku'],
  },
  {
    id: 'panic', zh: '慌张', en: 'panic',
    emo: ['panic', 'nervous', '慌'],
    ali: ['慌张', '紧张', '手忙脚乱', '冒汗', '心跳加速', '不安', '着急', '慌乱', 'flustered', 'anxious', 'nervous'],
    cats: ['hawawa', 'asease', 'aseru', 'awateru', 'gakuburu', 'kyorokyoro', 'sowasowa', 'kinchou', 'sweat'],
  },
  {
    id: 'surprise', zh: '惊讶', en: 'surprise',
    emo: ['surprise', 'shock', '惊讶'],
    ali: ['震惊', '吃惊', '傻眼', '意想不到', '哇', '天啊', 'wow', 'shocked', 'amazed', 'astonished'],
    cats: ['surprise', 'shock', 'gaan', 'kyaa', 'uwaan', 'nandato', 'buwaa', 'boon', 'eieio'],
  },
  {
    id: 'scary', zh: '害怕', en: 'scared',
    emo: ['scared', 'fear', '害怕'],
    ali: ['恐惧', '恐怖', '吓到', '瑟瑟发抖', '阴森', '毛骨悚然', '妖怪', '鬼', 'terrified', 'horror', 'creepy'],
    cats: ['scary', 'obake', 'obieru', 'oni', 'noroi', 'kiken', 'gyaa'],
  },
  {
    id: 'sick', zh: '不舒服', en: 'sick',
    emo: ['sick', 'ill', '病了'],
    ali: ['生病', '感冒', '不舒服', '难受', '发烧', '咳嗽', '打喷嚏', '恶心', '头晕', 'ill', 'unwell', 'fever'],
    cats: ['kaze', 'kushami', 'guaiwarui', 'yoboyobo', 'itai', 'gokiburi', 'menhera'],
  },
  {
    id: 'cute', zh: '可爱', en: 'cute',
    emo: ['cute', 'kawaii', '可爱'],
    ali: ['萌', '软萌', '可爱炸了', '毛茸茸', '软绵绵', '梦幻', '少女', 'kawaii', 'moe', 'adorable', 'fluffy'],
    cats: ['cute', 'yumekawa', 'kyururun', 'fuwafuwa', 'mofumofu', 'munimuni', 'mochimochi', 'momimomi', 'akachan', 'nikukyuu'],
  },
  {
    id: 'cat', zh: '猫', en: 'cat',
    emo: ['cute'],
    ali: ['喵', '小猫', '猫咪', '猫猫', 'kitty', 'meow', 'neko'],
    cats: ['cat', 'nyaa', 'kitty', 'tora', 'lion'],
  },
  {
    id: 'dog', zh: '狗', en: 'dog',
    emo: ['cute'],
    ali: ['汪', '小狗', '狗狗', '柴犬', 'puppy', 'woof', 'inu'],
    cats: ['dog', 'moeshinu', 'dogeza', 'buta', 'horse'],
  },
  {
    id: 'animal', zh: '其他动物', en: 'animal',
    emo: ['cute'],
    ali: ['兔子', '鱼', '螃蟹', '海豹', '熊', '狐狸', '企鹅', '小鸟', '章鱼', '仓鼠', '青蛙', 'rabbit', 'fish', 'bear', 'penguin', 'bird', 'frog'],
    cats: ['animal', 'rabbit', 'fish', 'kani', 'azarashi', 'kuma', 'tanuki', 'kitsune', 'momonga', 'kurage', 'pengin', 'gorira', 'ahiru', 'hiyoko', 'tako', 'tori', 'unagi', 'kaeru', 'kamome', 'hamusutaa'],
  },
  {
    id: 'eat', zh: '吃东西', en: 'eating',
    emo: ['eating', '吃'],
    ali: ['饿', '干饭', '好吃', '美食', '馋', '嚼', '喝', '饮料', '咖啡', '啤酒', 'food', 'yum', 'hungry', 'delicious'],
    cats: ['mogumogu', 'mushamusha', 'taberu', 'gokugoku', 'peropero', 'pe', 'delicious', 'umai', 'raamen', 'takoyaki', 'rice', 'gochisousama', 'itadakimasu', 'gokuri', 'nomu', 'ocha', 'beer', 'cafe'],
  },
  {
    id: 'study', zh: '学习工作', en: 'studying',
    emo: ['studying', 'work', '学习'],
    ali: ['学习', '看书', '备考', '工作', '写作业', '专注', '努力', '加班', '上班', 'study', 'exam', 'focus', 'grind'],
    cats: ['benkyou', 'pasokon', 'memo', 'kangaeru', 'shingichuu', 'otsukaresama', 'oteage'],
  },
  {
    id: 'music', zh: '音乐', en: 'music',
    emo: ['music', '音乐'],
    ali: ['唱歌', '听歌', '哼歌', '口哨', 'KTV', 'sing', 'song', 'whistle'],
    cats: ['utau', 'karaoke', 'kuchibue', 'dance'],
  },
  {
    id: 'dance', zh: '跳舞', en: 'dance',
    emo: ['dance', '跳舞'],
    ali: ['舞', '摇摆', '蹦迪', '嗨', '祭典', 'dancing', 'groove', 'festival'],
    cats: ['dance', 'norinori', 'wasshoi', 'matsuri', 'karaoke'],
  },
  {
    id: 'run', zh: '跑', en: 'running',
    emo: ['running', 'hurry', '跑'],
    ali: ['跑', '赶时间', '冲', '急', '来不及', '逃', 'dash', 'rush', 'hurry'],
    cats: ['run', 'dash', 'tobu', 'nigeru', 'aseru'],
  },
  {
    id: 'hug', zh: '抱抱安慰', en: 'hug',
    emo: ['comfort', 'hug', '抱'],
    ali: ['抱抱', '安慰', '摸摸头', '顺毛', '贴贴', '撒娇', '亲亲', 'hug', 'cuddle', 'comfort', 'pat'],
    cats: ['hug', 'dakitsuku', 'gyu', 'nadenade', 'yoshiyoshi', 'surisuri', 'iikoiiko', 'naderu', 'amaeru', 'nakayoshi'],
  },
  {
    id: 'greeting', zh: '打招呼', en: 'greeting',
    emo: ['greeting', 'hello'],
    ali: ['你好', '嗨', '早', '晚安', '再见', '拜拜', '我回来了', '出门', '欢迎', '击掌', '挥手', 'hello', 'hi', 'bye', 'good morning', 'good night', 'welcome'],
    cats: ['aisatsu', 'bow', 'good-morning', 'konbanwa', 'sayounara', 'byebye', 'matane', 'itterasshai', 'ittekimasu', 'tadaima', 'okaeri', 'haitacchi', 'peace', 'wink', 'tewofuru', 'salute', 'yoroshiku'],
  },
  {
    id: 'thanks', zh: '感谢道歉', en: 'thanks',
    emo: ['thanks', 'sorry'],
    ali: ['谢谢', '感谢', '对不起', '抱歉', '感谢你', '道歉', '谢啦', 'thank you', 'thanks', 'sorry', 'apologize'],
    cats: ['thanks', 'azasu', 'orei', 'sumimasen', 'sorry', 'moushiwakenai', 'ayamaru', 'douzo'],
  },
  {
    id: 'praise', zh: '夸奖称赞', en: 'praise',
    emo: ['praise', 'approve', '夸'],
    ali: ['厉害', '牛', '棒', '优秀', '认可', '鼓励', '佩服', '干得好', '帅', '鼓掌', 'nice', 'great', 'good job', 'awesome', 'applause', 'respect'],
    cats: ['sugoi', 'erai', 'good-job', 'iine', 'kakkoii', 'saikou', 'applause', 'doya', 'pachipachi', 'banzai', 'congratulations', 'ehhen'],
  },
  {
    id: 'cheer', zh: '加油', en: 'cheer',
    emo: ['cheer', 'fighting', '加油'],
    ali: ['加油', '努力', '支持', '打气', '冲鸭', '你可以的', '祈祷', 'fight', 'go go', 'you can do it', 'pray'],
    cats: ['fight', 'ganbaru', 'ouen', 'furefure', 'pray', 'kamoon', 'genki', 'goo', 'yossha', 'gaman'],
  },
  {
    id: 'refuse', zh: '拒绝不要', en: 'refuse',
    emo: ['refuse', 'stop', '拒绝'],
    ali: ['不要', '不行', '停止', '别', '拒绝', '不干', '算了', '放弃', 'no', 'nope', 'refuse', 'stop'],
    cats: ['dame', 'irane', 'muri', 'gaman', 'iyan', 'donbiki', 'pui', 'shizukani'],
  },
  {
    id: 'summer', zh: '夏天', en: 'summer',
    emo: ['summer'],
    ali: ['热', '夏天', '太阳', '烟花', '出汗', 'hot', 'summer', 'fireworks', 'sun'],
    cats: ['natsu', 'sun', 'taiyou', 'hanabi', 'atsui', 'samui'],
  },
  {
    id: 'winter', zh: '冬天', en: 'winter',
    emo: ['winter'],
    ali: ['冷', '下雪', '雪人', '冬天', 'cold', 'snow', 'winter'],
    cats: ['yuki', 'samui', 'haru', 'aki'],
  },
  {
    id: 'festival', zh: '节日', en: 'festival',
    emo: ['festival'],
    ali: ['圣诞', '新年', '生日', '情人节', '万圣节', '节日', '庆祝', 'christmas', 'birthday', 'valentine', 'halloween', 'new year'],
    cats: ['kurisumasu', 'oshogatsu', 'birthday', 'valentine', 'halloween', 'matsuri', 'hanabi', 'kanpai'],
  },
  {
    id: 'magic', zh: '魔法闪亮', en: 'magic',
    emo: ['magic', 'sparkle', '闪亮'],
    ali: ['魔法', '闪闪', '仙女', '天使', '星光', '流星', '泡泡', '梦幻', 'bling', 'magic', 'sparkle', 'angel', 'shiny', 'dreamy'],
    cats: ['magic', 'majo', 'angel', 'star', 'tsuki', 'nagareboshi', 'shabondama', 'kirakira', 'pikapika', 'kiraan', 'beam', 'hirameku'],
  },
  {
    id: 'weird', zh: '搞怪', en: 'weird',
    emo: ['weird', 'creepy'],
    ali: ['搞怪', '变态', '奇怪', '抽象', '猥琐', '中二', '神经病', 'weird', 'creepy', 'cursed', 'glitch'],
    cats: ['hengao', 'guhehe', 'piero', 'aho', 'hage', 'otaku', 'gyaru', 'waruikao', 'shirome', 'jitome', 'deppa', 'menhera'],
  },
  {
    id: 'chiikawa', zh: '吉伊卡哇', en: 'chiikawa',
    emo: ['cute'],
    ali: ['吉伊卡哇', '小可爱', 'chiikawa', 'ちいかわ'],
    cats: ['chiikawa'],
  },
  {
    id: 'character', zh: '角色联名', en: 'character',
    emo: ['cute'],
    ali: ['三丽鸥', '美乐蒂', '米菲', '哆啦A梦', '面包超人', '卡比', 'sanrio', 'my melody', 'miffy', 'doraemon', 'kirby'],
    cats: ['my-melody', 'miffy', 'doraemon', 'anpanman', 'kirby', 'baymax', 'character'],
  },
];

/* ------------------------------------------------------------- 质量评分 */

/**
 * 源数据里 1,768 条带 HTML 实体（(&gt;ᴗ&lt;) 这种），是抓取时没解码留下的。
 * 不处理的话发到聊天里就是一堆 &gt;&lt;，很难看。
 */
function decodeHtml(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, g) => {
    const k = g.toLowerCase();
    if (named[k]) return named[k];
    if (k.startsWith('#x')) {
      const cp = parseInt(k.slice(2), 16);
      return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    if (k.startsWith('#')) {
      const cp = parseInt(k.slice(1), 10);
      return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return m;
  });
}

const COMBINING = /[\u0300-\u036F\u0483-\u0489\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

/**
 * 源数据有 212 条含隐形格式字符（U+200E 方向标记、U+200B 零宽空格、U+00AD 软连字符）。
 * 肉眼看不见，但在某些渲染器里会撑出一格空白，发出去就是条歪掉的颜文字。
 * 注意 U+200C / U+200D 不能删——emoji 组合靠它们。
 */
const INVISIBLE = /[\u00AD\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function stripInvisible(s) {
  return s.replace(INVISIBLE, '');
}

function gradeQuality(s) {
  const combining = (s.match(COMBINING) || []).length;
  const len = [...s].length;
  const nonBmp = [...s].some((ch) => ch.codePointAt(0) > 0xffff);
  if (nonBmp || combining >= 4 || len > 26) return 'heavy';
  if (combining >= 1 || len > 16) return 'fancy';
  return 'clean';
}

const CUTE = /[ω・ᴗᵕ‿◡⌒˙ε๑♡♥★☆✧✿❀˶ᵔᴥฅᐢᗜ]/gu;

function scoreItem(s) {
  const len = [...s].length;
  let v = 60;
  if (len >= 6 && len <= 14) v += 22;
  else if (len <= 20) v += 10;
  else if (len > 26) v -= 30;
  else v -= 4;

  const cute = (s.match(CUTE) || []).length;
  v += Math.min(cute * 5, 22);

  if (/^[\x20-\x7E]+$/.test(s)) v -= 16;
  const combining = (s.match(COMBINING) || []).length;
  v -= combining * 4;
  if (/[\u2000-\u2BFF]/.test(s) && len >= 5) v += 3;
  return Math.max(0, Math.min(100, v));
}

const TAGS = [
  [/[♡♥❤💕💖]/u, 'heart'],
  [/[╥╯╰ㅠㅜ᷄᷅]|T{2}|;{2}/u, 'crying'],
  [/[★☆✧✦✩✶⋆⭐]/u, 'sparkle'],
  [/ฅ|ᐢ|ᴥ|ᵔᴥᵔ|ΦωΦ|ᓚᘏᗢ|ᐠ|・ω・/u, 'animal'],
  [/╬|╦|╤─|╾|🔪|⚔/u, 'weapon'],
  [/〃|\/\/|⁄⁄/u, 'shy'],
  [/[♪♫♬♩]/u, 'music'],
  [/[✿❀🌸🌷]/u, 'flower'],
];

function extractTags(s) {
  const out = [];
  for (const [re, tag] of TAGS) if (re.test(s)) out.push(tag);
  return out;
}

/* --------------------------------------------------------------- 构建 */

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const srcCats = Object.keys(src);
const used = new Set();
const missing = new Set();

const categories = [];
const seen = new Set();
let total = 0;

for (const m of MOODS) {
  const items = [];
  for (const cid of m.cats) {
    if (!src[cid]) {
      missing.add(cid);
      continue;
    }
    used.add(cid);
    for (const raw of src[cid]) {
      const t = stripInvisible(decodeHtml(String(raw))).trim();
      // 解码后还残留实体（嵌套的 &amp;gt; 之类）就不要了，发出去照样难看
      if (!t || /&(#x?[0-9a-f]+|[a-z]+);/i.test(t) || seen.has(t)) continue;
      seen.add(t);
      items.push({ t, q: gradeQuality(t), s: scoreItem(t), g: extractTags(t).join(',') });
    }
  }
  items.sort((a, b) => b.s - a.s);
  total += items.length;
  categories.push({
    id: m.id,
    zh: m.zh,
    en: m.en,
    ko: '',
    emo: m.emo,
    ali: m.ali,
    sample: items[0]?.t || '',
    items,
  });
}

// 没被任何 mood 用到的分类，报出来看看是不是漏了重要的
const unused = srcCats.filter((c) => !used.has(c));

const out = {
  version: '1.0',
  source: 'kaomoji-collection (MIT) — https://github.com/kaomojiya-collection/kaomoji-collection',
  license: 'MIT',
  total,
  categories,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');

const q = { clean: 0, fancy: 0, heavy: 0 };
for (const c of categories) for (const it of c.items) q[it.q]++;

console.log(`✅ ${OUT}`);
console.log(`   ${categories.length} 个情绪分类 / ${total} 条（原始 ${srcCats.length} 个日文分类）`);
console.log(`   质量  clean ${q.clean} | fancy ${q.fancy} | heavy ${q.heavy}`);
console.log(`   体积  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
if (missing.size) console.log(`   ⚠️  映射里有不存在的分类: ${[...missing].join(', ')}`);
if (unused.length) console.log(`   ℹ️  未纳入的分类 ${unused.length} 个: ${unused.slice(0, 40).join(', ')}${unused.length > 40 ? ' …' : ''}`);

// 每个 mood 的条数，太少的要补
const thin = categories.filter((c) => c.items.length < 20);
if (thin.length) console.log(`   ⚠️  偏少的分类: ${thin.map((c) => `${c.id}(${c.items.length})`).join(', ')}`);

/* ------------------------------------------------- 生成内联压缩数据 */
/**
 * Worker 要能一键粘贴到 Cloudflare 后台，所以把数据 gzip + base64 内联。
 * 1,365 KB 原始 JSON → gzip 276 KB → base64 368 KB，单文件塞得下。
 */
import zlib from 'node:zlib';

const raw = fs.readFileSync(OUT);
const gz = zlib.gzipSync(raw, { level: 9 });
const b64 = gz.toString('base64');
const inlinePath = path.join(ROOT, 'src/data.b64.mjs');
fs.writeFileSync(
  inlinePath,
  `// 自动生成，勿手改。由 scripts/build-data.mjs 从 data/kaomoji.json 压缩而来。\nexport default ${JSON.stringify(b64)};\n`,
  'utf8'
);
console.log(`   gzip ${(gz.length / 1024).toFixed(0)} KB → base64 ${(b64.length / 1024).toFixed(0)} KB（内联用）`);
