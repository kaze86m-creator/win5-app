export type Horse = {
  id: string;
  number: number;
  name: string;
};

export type Race = {
  id: string;
  raceNumber: number; // WIN5の1レース目〜5レース目
  raceName: string;
  horses: Horse[];
};

export const mockRaces: Race[] = [
  {
    id: "race1",
    raceNumber: 1,
    raceName: "東京10R 晩春ステークス",
    horses: [
      { id: "h1-1", number: 1, name: "サトノレーヴ" },
      { id: "h1-2", number: 2, name: "オメガウインク" },
      { id: "h1-3", number: 3, name: "ドゥラモンド" },
      { id: "h1-4", number: 4, name: "ロジリオン" },
      { id: "h1-5", number: 5, name: "ダノンスコーピオン" },
    ]
  },
  {
    id: "race2",
    raceNumber: 2,
    raceName: "京都10R 橘ステークス",
    horses: [
      { id: "h2-1", number: 1, name: "エポックヴィーナス" },
      { id: "h2-2", number: 2, name: "シヴァース" },
      { id: "h2-3", number: 3, name: "ナナオ" },
      { id: "h2-4", number: 4, name: "オメガリッチマン" },
      { id: "h2-5", number: 5, name: "ガロンヌ" },
    ]
  },
  {
    id: "race3",
    raceNumber: 3,
    raceName: "新潟11R 新潟大賞典(G3)",
    horses: [
      { id: "h3-1", number: 1, name: "ヨーホーレイク" },
      { id: "h3-2", number: 2, name: "レーベンスティール" },
      { id: "h3-3", number: 3, name: "ヤマニンサルバム" },
      { id: "h3-4", number: 4, name: "カラテ" },
      { id: "h3-5", number: 5, name: "ダンディズム" },
      { id: "h3-6", number: 6, name: "マイネルクリソーラ" },
    ]
  },
  {
    id: "race4",
    raceNumber: 4,
    raceName: "東京11R NHKマイルC(G1)",
    horses: [
      { id: "h4-1", number: 1, name: "ダノンマッキンリー" },
      { id: "h4-2", number: 2, name: "ノーブルロジャー" },
      { id: "h4-3", number: 3, name: "ディスペランツァ" },
      { id: "h4-4", number: 4, name: "ジャンタルマンタル" },
      { id: "h4-5", number: 5, name: "ボンドガール" },
      { id: "h4-6", number: 6, name: "アスコリピチェーノ" },
    ]
  },
  {
    id: "race5",
    raceNumber: 5,
    raceName: "京都11R 鞍馬ステークス",
    horses: [
      { id: "h5-1", number: 1, name: "ビッグシーザー" },
      { id: "h5-2", number: 2, name: "ジャスティンマカオ" },
      { id: "h5-3", number: 3, name: "アグリ" },
      { id: "h5-4", number: 4, name: "ブトンドール" },
      { id: "h5-5", number: 5, name: "サーマルウインド" },
    ]
  }
];
