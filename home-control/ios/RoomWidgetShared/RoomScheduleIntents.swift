import AppIntents

@available(iOS 17.0, *)
enum ScheduleOperation: String, AppEnum {
  case create, list, cancel
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Schedule operation"
  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [.create: "Create", .list: "List", .cancel: "Cancel"]
}

@available(iOS 17.0, *)
enum ScheduledRoomAction: String, AppEnum {
  case acOff, acOn, fanOff, fanOn, tubeOff, tubeOn, enter, leave, reminder
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Scheduled action"
  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .acOff: "Turn AC off", .acOn: "Turn AC on", .fanOff: "Turn fan off", .fanOn: "Turn fan on",
    .tubeOff: "Turn tube light off", .tubeOn: "Turn tube light on", .enter: "Enter Room", .leave: "Leave Room", .reminder: "Reminder"]
}

@available(iOS 17.0, *)
enum ScheduleTimeKind: String, AppEnum {
  case after, at
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "When"
  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [.after: "After a number of hours", .at: "At a date and time"]
}

@available(iOS 17.0, *)
enum ScheduleRepeat: String, AppEnum {
  case none, daily, weekdays
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Repeat"
  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [.none: "Once", .daily: "Every day", .weekdays: "Weekdays"]
}

/// One registration, with follow-up questions rather than unsupported multi-slot phrases.
@available(iOS 17.0, *)
struct ManageRoomSchedulesIntent: AppIntent {
  static let title: LocalizedStringResource = "Manage Room Schedules"
  static let openAppWhenRun = false
  static var authenticationPolicy: IntentAuthenticationPolicy { .requiresAuthentication }
  @Parameter(title: "Repeat") var recurrence: ScheduleRepeat?
  @Parameter(title: "Operation") var operation: ScheduleOperation?
  @Parameter(title: "Action") var action: ScheduledRoomAction?
  @Parameter(title: "When") var timeKind: ScheduleTimeKind?
  @Parameter(title: "Hours from now") var hours: Double?
  @Parameter(title: "Date and time") var date: Date?
  @Parameter(title: "Reminder text") var message: String?
  @Parameter(title: "Schedule number") var number: Int?

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard RoomScheduleClient.configured else { throw ScheduleError("Open Room's Schedules & Alerts sheet to connect cloud scheduling first.") }
    let op: ScheduleOperation
    if let value = operation { op = value }
    else { op = try await $operation.requestValue("Would you like to create, list, or cancel a schedule?") }
    if op == .list || op == .cancel {
      let response = try await RoomScheduleClient.list()
      let all = response["schedules"] as? [[String: Any]] ?? []
      let upcoming = all.filter { ["pending", "scheduled"].contains($0["status"] as? String ?? "") }.sorted { ($0["runAt"] as? String ?? "") < ($1["runAt"] as? String ?? "") }
      guard !upcoming.isEmpty else { return .result(dialog: "There are no upcoming schedules.") }
      let descriptions = upcoming.prefix(10).enumerated().map { index, schedule in
        let rawTime = schedule["runAt"] as? String ?? ""
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: rawTime) ?? ISO8601DateFormatter().date(from: rawTime)
        let time = date?.formatted(date: .abbreviated, time: .shortened) ?? rawTime
        return "\(index + 1). \(schedule["title"] as? String ?? schedule["action"] as? String ?? "Action"), \(time)"
      }.joined(separator: ". ")
      if op == .list { return .result(dialog: IntentDialog(stringLiteral: descriptions)) }
      let chosen: Int
    if let value = number { chosen = value }
    else { chosen = try await $number.requestValue(IntentDialog(stringLiteral: descriptions + ". Which schedule number should I cancel?")) }
      guard (1...min(upcoming.count, 10)).contains(chosen), let id = upcoming[chosen - 1]["id"] as? String else { throw ScheduleError("Choose a schedule number from the list.") }
      _ = try await RoomScheduleClient.cancel(id)
      return .result(dialog: "Schedule cancelled.")
    }
    let selected: ScheduledRoomAction
    if let value = action { selected = value }
    else { selected = try await $action.requestValue("What would you like to schedule?") }
    let kind: ScheduleTimeKind
    if let value = timeKind { kind = value }
    else { kind = try await $timeKind.requestValue("After how many hours, or at a date and time?") }
    let runAt: Date
    if kind == .after {
      let duration: Double
    if let value = hours { duration = value }
    else { duration = try await $hours.requestValue("In how many hours? You can say six or seven, or half an hour.") }
      guard duration.isFinite, duration > 0, duration <= 8760 else { throw ScheduleError("Choose a duration greater than zero and no more than one year.") }
      runAt = Date().addingTimeInterval(duration * 3600)
    } else if let date { runAt = date }
    else { runAt = try await $date.requestValue("At what date and time?") }
    guard runAt > Date() else { throw ScheduleError("Choose a future date and time.") }
    if selected == .enter || selected == .leave {
      try await requestConfirmation(result: .result(dialog: "Scheduled room scenes can control cloud devices, but cannot reach the local bulbs. Continue with a partial scene and failure alerts?"))
    }
    let repeatRule: ScheduleRepeat
    if let recurrence { repeatRule = recurrence }
    else { repeatRule = try await $recurrence.requestValue("Run once, every day, or on weekdays?") }
    var input: [String: Any] = ["requestId": UUID().uuidString, "action": selected.rawValue,
      "runAt": ISO8601DateFormatter().string(from: runAt), "timeZone": TimeZone.current.identifier, "recurrence": repeatRule.rawValue]
    if selected == .enter || selected == .leave { input["acknowledgePartialScene"] = true }
    if selected == .reminder {
      if let message { input["message"] = message }
      else { input["message"] = try await $message.requestValue("What should the reminder say?") }
    }
    _ = try await RoomScheduleClient.create(input)
    let formatted = runAt.formatted(date: .complete, time: .shortened)
    return .result(dialog: IntentDialog(stringLiteral: "Scheduled for \(formatted)\(repeatRule == .none ? "" : repeatRule == .daily ? ", repeating every day" : ", repeating on weekdays")."))
  }
}

@available(iOS 17.0, *)
struct SetLightsPowerIntent: AppIntent {
  static let title: LocalizedStringResource = "Turn Lights On or Off"
  static let openAppWhenRun = false
  static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }
  @Parameter(title: "Power") var power: PowerState
  @Parameter(title: "Lights", default: .all) var group: LightGroup
  func perform() async throws -> some IntentResult & ProvidesDialog {
    if power.isOn { try await RoomController.shared.lightsOn(group: group.configGroup) }
    else { try await RoomController.shared.lightsOff(group: group.configGroup) }
    RoomIntentSupport.reloadWidget()
    return .result(dialog: power.isOn ? "Lights on." : "Lights off.")
  }
}
