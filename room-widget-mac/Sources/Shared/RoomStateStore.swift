import Foundation

actor RoomStateStore {
  static let shared = RoomStateStore()

  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init() {
    defaults = UserDefaults(suiteName: RoomConfig.sharedStateSuite) ?? .standard
  }

  func load() -> SavedRoomState? {
    guard let data = defaults.data(forKey: RoomConfig.sharedStateKey) else {
      return nil
    }

    return try? decoder.decode(SavedRoomState.self, from: data)
  }

  func save(_ state: SavedRoomState) throws {
    let data = try encoder.encode(state)
    defaults.set(data, forKey: RoomConfig.sharedStateKey)
  }
}
