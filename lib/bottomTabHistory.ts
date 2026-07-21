/** Last main bottom-tab route before Profile (or other non-main screens). */
export type MainBottomTabRoute = "/home" | "/discover" | "/community" | "/progress";

let lastMainTabRoute: MainBottomTabRoute = "/home";

export function rememberBottomTabRoute(route: string | null | undefined) {
  if (
    route === "/home" ||
    route === "/discover" ||
    route === "/community" ||
    route === "/progress"
  ) {
    lastMainTabRoute = route;
  }
}

export function getLastMainTabRoute(): MainBottomTabRoute {
  return lastMainTabRoute;
}
