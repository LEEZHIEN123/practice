/** Local custom food photos matched by meal category. */
export const FOOD_IMAGE_ASSETS = {
  oatmeal: require("../assets/food/oatmeal.jpg"),
  eggs: require("../assets/food/scrambled-eggs.jpg"),
  yogurt: require("../assets/food/yogurt.jpg"),
  soup: require("../assets/food/lentil-soup.jpg"),
  chili: require("../assets/food/chili.jpg"),
  curry: require("../assets/food/curry.jpg"),
  stirfry: require("../assets/food/stirfry.jpg"),
  bowl: require("../assets/food/quinoa-bowl.jpg"),
  veggieBurger: require("../assets/food/veggie-burger.jpg"),
  wrap: require("../assets/food/wrap.jpg"),
  avocadoToast: require("../assets/food/avocado-toast.jpg"),
  turkey: require("../assets/food/turkey.jpg"),
  tofu: require("../assets/food/tofu.jpg"),
  trailMix: require("../assets/food/trail-mix.jpg"),
  applePeanutButter: require("../assets/food/apple-peanut-butter.jpg"),
  bananaPeanutButter: require("../assets/food/banana-peanut-butter.jpg"),
  almonds: require("../assets/food/almonds.jpg"),
  apple: require("../assets/food/apple.jpg"),
  popcorn: require("../assets/food/popcorn.jpg"),
  hummus: require("../assets/food/hummus.jpg"),
  chicken: require("../assets/food/chicken.jpg"),
  salmon: require("../assets/food/salmon.jpg"),
  proteinBar: require("../assets/food/protein-bar.jpg"),
  steak: require("../assets/food/steak.jpg"),
} as const;

export type FoodImageAssetKey = keyof typeof FOOD_IMAGE_ASSETS;
