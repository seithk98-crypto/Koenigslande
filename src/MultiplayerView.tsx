import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Castle, Crown, Flag, Mail, Shield, Trophy, UserRound, Users,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import type {
  AllianceDetails, AllianceInvitation, DiplomaticRelation, MultiplayerOverview, MultiplayerProfile,
  PlayerRankings,
} from './types'

type Props = { playerId: string; onProfileNameChange: (username: string) => void }
type SocialTab = 'profile' | 'alliance' | 'diplomacy' | 'messages' | 'rankings'
type TabLabel = { id: SocialTab; label: string; icon: typeof UserRound }

const TABS: TabLabel[] = [
  { id: 'profile', label: 'Profil', icon: UserRound },
  { id: 'alliance', label: 'Allianz', icon: Shield },
  { id: 'diplomacy', label: 'Diplomatie', icon: Flag },
  { id: 'messages', label: 'Nachrichten', icon: Mail },
  { id: 'rankings', label: 'Ranglisten', icon: Trophy },
]

const RELATION_LABELS: Record<DiplomaticRelation['relation_type'], string> = {
  alliance: 'Bündnis',
  non_aggression: 'Nichtangriffspakt',
  war: 'Feindschaft',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(value: unknown) {
  if (value instanceof Error) return value.message
  if (isRecord(value) && typeof value.message === 'string') return value.message
  return 'Die Aktion konnte nicht abgeschlossen werden.'
}

export default function MultiplayerView({ playerId, onProfileNameChange }: Props) {
  const [tab, setTab] = useState<SocialTab>('profile')
  const [overview, setOverview] = useState<MultiplayerOverview | null>(null)
  const [rankings, setRankings] = useState<PlayerRankings | null>(null)
  const [publicProfile, setPublicProfile] = useState<MultiplayerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const profileDirtyRef = useRef(false)
  const socialRefreshRef = useRef<Promise<void> | null>(null)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [description, setDescription] = useState('')
  const [allianceName, setAllianceName] = useState('')
  const [allianceTag, setAllianceTag] = useState('')
  const [allianceDescription, setAllianceDescription] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [diplomacyTarget, setDiplomacyTarget] = useState('')
  const [diplomacyType, setDiplomacyType] = useState<DiplomaticRelation['relation_type']>('alliance')
  const [recipientName, setRecipientName] = useState('')
  const [privateBody, setPrivateBody] = useState('')
  const [allianceBody, setAllianceBody] = useState('')

  async function openPlayerProfile(profileId: string) {
    if (!supabase) return
    try {
      const { data, error: resultError } = await supabase.rpc('get_public_player_profile', {
        p_player_id: profileId,
      })
      if (resultError) throw resultError
      setPublicProfile(data as MultiplayerProfile)
    } catch (caught) {
      setError(messageOf(caught))
    }
  }

  function loadSocialData(active = () => true): Promise<void> {
    if (!supabase) return Promise.resolve()
    if (socialRefreshRef.current) return socialRefreshRef.current
    const refresh = (async () => {
      try {
        const { data: socialData, error: socialError } = await supabase.rpc('get_multiplayer_overview')
        if (!active()) return
        if (socialError) throw socialError
        const socialResult = socialData as MultiplayerOverview
        setOverview(socialResult)
        if (!profileDirtyRef.current) {
          setUsername(socialResult.profile.username)
          setAvatarUrl(socialResult.profile.avatar_url ?? '')
          setDescription(socialResult.profile.description)
        }
        setError('')
      } catch (caught) {
        if (active()) setError(messageOf(caught))
      } finally {
        if (active()) setLoading(false)
      }
    })()
    socialRefreshRef.current = refresh
    void refresh.finally(() => {
      if (socialRefreshRef.current === refresh) socialRefreshRef.current = null
    })
    return refresh
  }

  useEffect(() => {
    let active = true
    const refresh = () => void loadSocialData(() => active)
    refresh()
    const timer = window.setInterval(refresh, 30000)
    const channel = supabase?.channel(`multiplayer:${playerId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'multiplayer_notifications',
        filter: `recipient_id=eq.${playerId}`,
      }, refresh)
      .subscribe()
    return () => {
      active = false
      window.clearInterval(timer)
      if (channel) void supabase?.removeChannel(channel)
    }
  }, [playerId])

  useEffect(() => {
    if (tab !== 'rankings' || !supabase) return
    const client = supabase
    let active = true
    let refreshing = false
    const refreshRankings = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const { data, error: rankingError } = await client.rpc('get_player_rankings')
        if (!active) return
        if (rankingError) throw rankingError
        setRankings(data as PlayerRankings)
      } catch (caught) {
        if (active) setError(messageOf(caught))
      } finally {
        refreshing = false
      }
    }
    void refreshRankings()
    const timer = window.setInterval(() => void refreshRankings(), 30000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [tab])

  async function runAction(
    rpcName: string,
    args: Record<string, unknown>,
    successText: string,
  ) {
    if (!supabase || busy) return false
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc(rpcName, args)
      if (rpcError) throw rpcError
      setNotice(successText)
      await loadSocialData()
      return true
    } catch (caught) {
      setError(messageOf(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await runAction('update_player_profile', {
      p_username: username,
      p_avatar_url: avatarUrl || null,
      p_description: description,
    }, 'Dein Spielerprofil wurde gespeichert.')
    if (saved) {
      profileDirtyRef.current = false
      onProfileNameChange(username)
    }
  }

  async function createAlliance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await runAction('create_alliance', {
      p_name: allianceName,
      p_tag: allianceTag,
      p_description: allianceDescription,
    }, 'Deine Allianz wurde gegründet.')) {
      setAllianceName('')
      setAllianceTag('')
      setAllianceDescription('')
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await runAction('invite_alliance_member', { p_username: inviteName }, 'Die Einladung wurde versandt.')) {
      setInviteName('')
    }
  }

  async function respondInvitation(invitation: AllianceInvitation, accept: boolean) {
    await runAction('respond_alliance_invitation', {
      p_invitation_id: invitation.id,
      p_accept: accept,
    }, accept ? 'Du bist der Allianz beigetreten.' : 'Die Einladung wurde abgelehnt.')
  }

  async function startDiplomacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await runAction('propose_diplomacy', {
      p_target_alliance: diplomacyTarget,
      p_relation_type: diplomacyType,
    }, 'Die diplomatische Anfrage wurde gestellt.')) setDiplomacyTarget('')
  }

  async function sendPrivateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await runAction('send_private_message', {
      p_recipient_username: recipientName,
      p_body: privateBody,
    }, 'Deine Nachricht wurde gesendet.')) setPrivateBody('')
  }

  async function sendAllianceMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await runAction('send_alliance_message', { p_body: allianceBody }, 'Die Allianz-Nachricht wurde gesendet.')) {
      setAllianceBody('')
    }
  }

  const alliance = overview?.alliance ?? null
  const pendingInvitations = overview?.invitations ?? []
  const profile = overview?.profile

  return (
    <section className="village-view multiplayer-view">
      <div className="view-kicker"><span>SPIELER · WELT I</span><span>{profile?.points.toLocaleString('de-DE') ?? '—'} GESAMTPUNKTE</span></div>
      <div className="village-heading">
        <div><p className="eyebrow">DAS REICH DER SPIELER</p><h1>Gemeinschaft</h1></div>
        <div className="points-seal"><Users size={17} /><span><strong>{alliance ? `[${alliance.tag}]` : 'FREI'}</strong><small>ALLIANZ</small></span></div>
      </div>
      <p className="military-intro">Spielerprofile, Bündnisse, Diplomatie und Nachrichten werden aus der gemeinsamen Welt geladen und serverseitig geschützt.</p>
      {error && <p className="economy-error" role="alert">{error}</p>}
      {notice && <p className="social-notice" role="status">{notice}</p>}
      <nav className="social-tabs" aria-label="Gemeinschaftsbereiche">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button type="button" className={tab === id ? 'selected' : ''} key={id} onClick={() => setTab(id)}>
            <Icon size={15} />{label}{id === 'messages' && profile && overview?.messages.filter((message) => message.recipient_id === playerId && !message.read_at).length ? <span className="social-badge">{overview.messages.filter((message) => message.recipient_id === playerId && !message.read_at).length}</span> : null}
          </button>
        ))}
      </nav>
      {loading && !overview ? <p className="queue-empty">Spieler und Bündnisse werden geladen …</p> : null}

      {tab === 'profile' && profile && (
        <div className="social-panel">
          <div className="social-profile-card">
            <span className="social-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile.username.slice(0, 1).toUpperCase()}</span>
            <div><p className="eyebrow">SPIELERPROFIL</p><h2>{profile.username}</h2><p>{profile.alliance_tag ? `[${profile.alliance_tag}] ${profile.alliance_name}` : 'Ohne Allianz'}</p></div>
            <span className="social-rank"><Crown size={15} />{profile.points.toLocaleString('de-DE')} Punkte</span>
          </div>
          <dl className="social-stat-grid">
            <div><dt>Registriert seit</dt><dd>{new Date(profile.created_at).toLocaleDateString('de-DE')}</dd></div>
            <div><dt>Eigene Dörfer</dt><dd>{profile.village_count}</dd></div>
            <div><dt>Gesamtpunktzahl</dt><dd>{profile.points.toLocaleString('de-DE')}</dd></div>
            <div><dt>Allianz</dt><dd>{profile.alliance_tag ?? 'Keine'}</dd></div>
          </dl>
          <form className="social-form" onSubmit={(event) => void saveProfile(event)}>
            <div className="section-title"><div><p className="eyebrow">DEINE ANGABEN</p><h2>Profil bearbeiten</h2></div></div>
            <label>Spielername<input value={username} maxLength={24} minLength={3} onChange={(event) => { setUsername(event.target.value); profileDirtyRef.current = true }} required /></label>
            <label>Avatar-URL (HTTPS)<input type="url" value={avatarUrl} placeholder="https://…" onChange={(event) => { setAvatarUrl(event.target.value); profileDirtyRef.current = true }} /></label>
            <label>Beschreibung<textarea value={description} maxLength={500} rows={3} onChange={(event) => { setDescription(event.target.value); profileDirtyRef.current = true }} /></label>
            <button type="submit" className="dispatch-button" disabled={busy}>Profil speichern</button>
          </form>
        </div>
      )}

      {tab === 'alliance' && (
        <div className="social-panel">
          {pendingInvitations.length > 0 && <section className="social-section">
            <div className="section-title"><div><p className="eyebrow">EINLADUNGEN</p><h2>Offene Einladungen</h2></div><span>{pendingInvitations.length}</span></div>
            {pendingInvitations.map((invitation) => <div className="social-row" key={invitation.id}>
              <span><strong>[{invitation.alliance_tag}] {invitation.alliance_name}</strong><small>Einladung von {invitation.inviter_name}</small></span>
              <div className="social-actions">
                <button type="button" onClick={() => void respondInvitation(invitation, true)} disabled={busy}>Annehmen</button>
                <button type="button" onClick={() => void respondInvitation(invitation, false)} disabled={busy}>Ablehnen</button>
              </div>
            </div>)}
          </section>}
          {alliance ? <AlliancePanel
            alliance={alliance}
            currentPlayerId={playerId}
            busy={busy}
            inviteName={inviteName}
            onInviteNameChange={setInviteName}
            onInvite={inviteMember}
            onAction={runAction}
            onOpenProfile={(id) => void openPlayerProfile(id)}
          /> : <form className="social-form" onSubmit={(event) => void createAlliance(event)}>
            <div className="section-title"><div><p className="eyebrow">NEUER BUND</p><h2>Allianz gründen</h2></div></div>
            <p className="military-intro">Du wirst Gründer und erhältst die vollständige Verwaltung deiner Allianz.</p>
            <label>Allianzname<input value={allianceName} minLength={3} maxLength={40} onChange={(event) => setAllianceName(event.target.value)} required /></label>
            <label>Kürzel (2–6 Zeichen)<input value={allianceTag} minLength={2} maxLength={6} onChange={(event) => setAllianceTag(event.target.value.toUpperCase())} required /></label>
            <label>Beschreibung<textarea value={allianceDescription} maxLength={1000} rows={3} onChange={(event) => setAllianceDescription(event.target.value)} /></label>
            <button type="submit" className="dispatch-button" disabled={busy}>Allianz gründen</button>
          </form>}
          {alliance && <section className="social-section">
            <div className="section-title"><div><p className="eyebrow">WELT I</p><h2>Weitere Allianzen</h2></div><span>{overview?.alliances.length ?? 0}</span></div>
            {(overview?.alliances ?? []).filter((entry) => entry.id !== alliance.id).map((entry) => (
              <div className="social-row" key={entry.id}><span><strong>[{entry.tag}] {entry.name}</strong><small>{entry.member_count} Mitglieder · {entry.points.toLocaleString('de-DE')} Punkte</small></span></div>
            ))}
          </section>}
        </div>
      )}

      {tab === 'diplomacy' && (
        <div className="social-panel">
          {alliance && ['founder', 'leader', 'diplomat'].includes(alliance.role) ? <form className="social-form" onSubmit={(event) => void startDiplomacy(event)}>
            <div className="section-title"><div><p className="eyebrow">AUSSENBEZIEHUNGEN</p><h2>Beziehung vorschlagen</h2></div></div>
            <label>Allianz<select value={diplomacyTarget} onChange={(event) => setDiplomacyTarget(event.target.value)} required>
              <option value="">Allianz wählen …</option>
              {(overview?.alliances ?? []).filter((entry) => entry.id !== alliance.id).map((entry) => <option key={entry.id} value={entry.id}>[{entry.tag}] {entry.name}</option>)}
            </select></label>
            <label>Beziehungsart<select value={diplomacyType} onChange={(event) => setDiplomacyType(event.target.value as DiplomaticRelation['relation_type'])}>
              <option value="alliance">Bündnis</option><option value="non_aggression">Nichtangriffspakt</option><option value="war">Feindschaft</option>
            </select></label>
            <button type="submit" className="dispatch-button" disabled={busy || !diplomacyTarget}>Anfrage stellen</button>
          </form> : <p className="queue-empty">Diplomatische Anfragen können von Gründern, Anführern und Diplomaten gestellt werden.</p>}
          <section className="social-section">
            <div className="section-title"><div><p className="eyebrow">BEZIEHUNGEN</p><h2>Diplomatie</h2></div><span>{overview?.diplomacy.length ?? 0}</span></div>
            {!overview?.diplomacy.length ? <p className="queue-empty">Keine diplomatischen Beziehungen.</p> : overview.diplomacy.map((relation) => {
              const canManage = Boolean(alliance && ['founder', 'leader', 'diplomat'].includes(alliance.role))
              const canRespond = canManage && relation.status === 'pending' && relation.initiator_alliance_id !== alliance?.id
              return <div className="social-row" key={relation.id}>
                <span><strong>[{relation.other_alliance_tag}] {relation.other_alliance_name} · {RELATION_LABELS[relation.relation_type]}</strong><small>{relation.status === 'pending' ? 'Anfrage offen' : 'Aktive Beziehung'}</small></span>
                <div className="social-actions">
                  {canRespond && <button type="button" onClick={() => void runAction('respond_diplomacy', { p_relation_id: relation.id, p_accept: true }, 'Beziehung angenommen.')} disabled={busy}>Annehmen</button>}
                  {canRespond && <button type="button" onClick={() => void runAction('respond_diplomacy', { p_relation_id: relation.id, p_accept: false }, 'Anfrage abgelehnt.')} disabled={busy}>Ablehnen</button>}
                  {canManage && <button type="button" onClick={() => void runAction('end_diplomacy', { p_relation_id: relation.id }, 'Beziehung beendet.')} disabled={busy}>Beenden</button>}
                </div>
              </div>
            })}</section>
          <p className="social-footnote">Diplomatie beeinflusst derzeit keine Kampfformeln oder Truppenbewegungen.</p>
        </div>
      )}

      {tab === 'messages' && (
        <div className="social-panel">
          <form className="social-form" onSubmit={(event) => void sendPrivateMessage(event)}>
            <div className="section-title"><div><p className="eyebrow">SPIELERKOMMUNIKATION</p><h2>Private Nachricht</h2></div></div>
            <label>Empfängername<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required /></label>
            <label>Nachricht<textarea value={privateBody} maxLength={4000} rows={3} onChange={(event) => setPrivateBody(event.target.value)} required /></label>
            <button type="submit" className="dispatch-button" disabled={busy}>Nachricht senden</button>
          </form>
          <section className="social-section">
            <div className="section-title"><div><p className="eyebrow">POSTEINGANG</p><h2>Private Nachrichten</h2></div><span>{overview?.messages.length ?? 0}</span></div>
            {!overview?.messages.length ? <p className="queue-empty">Noch keine Nachrichten vorhanden.</p> : overview.messages.map((message) => {
              const incoming = message.recipient_id === playerId
              return <article className={`private-message${incoming && !message.read_at ? ' unread' : ''}`} key={message.id}>
                <div><strong>{incoming ? `Von ${message.sender_name}` : `An ${message.recipient_name}`}</strong><time>{new Date(message.created_at).toLocaleString('de-DE')}</time></div>
                <p>{message.body}</p>
                <div className="social-actions">
                  {incoming && !message.read_at && <button type="button" onClick={() => void runAction('manage_private_message', { p_message_id: message.id, p_action: 'read' }, 'Nachricht als gelesen markiert.')} disabled={busy}>Als gelesen markieren</button>}
                  <button type="button" onClick={() => void runAction('manage_private_message', { p_message_id: message.id, p_action: 'archive' }, 'Nachricht archiviert.')} disabled={busy}>Archivieren</button>
                  <button type="button" onClick={() => void runAction('manage_private_message', { p_message_id: message.id, p_action: 'delete' }, 'Nachricht gelöscht.')} disabled={busy}>Löschen</button>
                </div>
              </article>
            })}</section>
          {alliance && <section className="social-section">
            <div className="section-title"><div><p className="eyebrow">BUNDESHALLE · [{alliance.tag}]</p><h2>Allianzkommunikation</h2></div></div>
            <form className="social-form compact" onSubmit={(event) => void sendAllianceMessage(event)}>
              <label>Nachricht an alle Mitglieder<textarea value={allianceBody} maxLength={4000} rows={2} onChange={(event) => setAllianceBody(event.target.value)} required /></label>
              <button type="submit" className="dispatch-button" disabled={busy}>An Allianz senden</button>
            </form>
            {alliance.messages.map((message) => <article className="private-message" key={message.id}><div><strong>{message.sender_name}</strong><time>{new Date(message.created_at).toLocaleString('de-DE')}</time></div><p>{message.body}</p></article>)}
          </section>}
        </div>
      )}

      {tab === 'rankings' && (
        <div className="social-panel rankings-grid">
          <RankingTable title="Spieler" icon={UserRound} rows={rankings?.players ?? []} render={(row) => <><button type="button" className="ranking-profile-button" onClick={() => void openPlayerProfile(row.id)}>{row.username}</button><small>{row.village_count} Dörfer · {row.alliance_tag ? `[${row.alliance_tag}]` : 'ohne Allianz'}</small><b>{row.points.toLocaleString('de-DE')}</b></>} />
          <RankingTable title="Allianzen" icon={Shield} rows={rankings?.alliances ?? []} render={(row) => <><strong>[{row.tag}] {row.name}</strong><small>{row.member_count} Mitglieder</small><b>{row.points.toLocaleString('de-DE')}</b></>} />
          <RankingTable title="Dörfer" icon={Castle} rows={rankings?.villages ?? []} render={(row) => <><strong>{row.name}</strong><small>{row.owner_name} · ({row.x} | {row.y}) {row.alliance_tag ? `[${row.alliance_tag}]` : ''}</small><b>{row.points.toLocaleString('de-DE')}</b></>} />
        </div>
      )}
      {publicProfile && <div className="profile-modal-backdrop" role="presentation" onClick={() => setPublicProfile(null)}>
        <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="public-profile-name" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="profile-modal-close" onClick={() => setPublicProfile(null)} aria-label="Profil schließen">×</button>
          <div className="social-profile-card">
            <span className="social-avatar">{publicProfile.avatar_url ? <img src={publicProfile.avatar_url} alt="" /> : publicProfile.username.slice(0, 1).toUpperCase()}</span>
            <div><p className="eyebrow">SPIELERPROFIL</p><h2 id="public-profile-name">{publicProfile.username}</h2><p>{publicProfile.alliance_tag ? `[${publicProfile.alliance_tag}] ${publicProfile.alliance_name}` : 'Ohne Allianz'}</p></div>
          </div>
          <p>{publicProfile.description || 'Keine Beschreibung hinterlegt.'}</p>
          <dl className="social-stat-grid"><div><dt>Registriert seit</dt><dd>{new Date(publicProfile.created_at).toLocaleDateString('de-DE')}</dd></div><div><dt>Dörfer</dt><dd>{publicProfile.village_count}</dd></div><div><dt>Punkte</dt><dd>{publicProfile.points.toLocaleString('de-DE')}</dd></div></dl>
        </section>
      </div>}
    </section>
  )
}

function AlliancePanel({
  alliance, currentPlayerId, busy, inviteName, onInviteNameChange, onInvite, onAction,
  onOpenProfile,
}: {
  alliance: AllianceDetails
  currentPlayerId: string
  busy: boolean
  inviteName: string
  onInviteNameChange: (value: string) => void
  onInvite: (event: FormEvent<HTMLFormElement>) => void
  onAction: (rpcName: string, args: Record<string, unknown>, successText: string) => Promise<boolean>
  onOpenProfile: (playerId: string) => void
}) {
  const canManage = alliance.role === 'founder' || alliance.role === 'leader'
  const isFounder = alliance.role === 'founder'
  return <>
    <section className="social-section alliance-profile">
      <div><p className="eyebrow">ALLIANZPROFIL · {alliance.role.toUpperCase()}</p><h2>[{alliance.tag}] {alliance.name}</h2><p>{alliance.description || 'Keine Beschreibung hinterlegt.'}</p></div>
      <span className="alliance-crest"><Shield size={25} /></span>
    </section>
    {canManage && <form className="social-form compact" onSubmit={onInvite}>
      <label>Spieler einladen<input value={inviteName} onChange={(event) => onInviteNameChange(event.target.value)} placeholder="Eindeutiger Spielername" required /></label>
      <button type="submit" className="dispatch-button" disabled={busy}>Einladung senden</button>
    </form>}
    <section className="social-section">
      <div className="section-title"><div><p className="eyebrow">BUNDESMITGLIEDER</p><h2>Mitglieder</h2></div><span>{alliance.members.length}</span></div>
      {alliance.members.map((member) => <div className="social-row" key={member.id}>
        <span><strong><button type="button" className="social-name-button" onClick={() => onOpenProfile(member.id)}>{member.username}{member.id === currentPlayerId ? ' · Du' : ''}</button></strong><small>{member.role} · {member.points.toLocaleString('de-DE')} Punkte · {member.village_count} Dörfer</small></span>
        {canManage && member.id !== currentPlayerId && member.role !== 'founder' && <div className="social-actions">
          {isFounder && <select aria-label={`Rolle von ${member.username}`} value={member.role} onChange={(event) => void onAction('manage_alliance_member', { p_player_id: member.id, p_action: 'role', p_role: event.target.value }, 'Allianzrolle geändert.')} disabled={busy}>
            <option value="member">Mitglied</option><option value="leader">Anführer</option><option value="diplomat">Diplomat</option>
          </select>}
          <button type="button" onClick={() => void onAction('manage_alliance_member', { p_player_id: member.id, p_action: 'remove' }, 'Mitglied entfernt.')} disabled={busy}>Entfernen</button>
        </div>}
      </div>)}
    </section>
    <div className="social-actions alliance-admin-actions">
      {!isFounder && <button type="button" onClick={() => void onAction('leave_alliance', {}, 'Du hast die Allianz verlassen.')} disabled={busy}>Allianz verlassen</button>}
      {isFounder && <button type="button" className="danger-action" onClick={() => {
        if (window.confirm(`Allianz [${alliance.tag}] ${alliance.name} wirklich auflösen?`)) {
          void onAction('dissolve_alliance', {}, 'Die Allianz wurde aufgelöst.')
        }
      }} disabled={busy}>Allianz auflösen</button>}
    </div>
  </>
}

function RankingTable<T extends { id: string }>({
  title, icon: Icon, rows, render,
}: {
  title: string
  icon: typeof UserRound
  rows: T[]
  render: (row: T) => ReactNode
}) {
  return <section className="ranking-card">
    <div className="section-title"><div><p className="eyebrow">RANGLISTE</p><h2><Icon size={17} />{title}</h2></div><span>{rows.length}</span></div>
    {!rows.length ? <p className="queue-empty">Noch keine Einträge.</p> : <ol>{rows.map((row, index) => <li key={row.id}><i>{index + 1}</i><span className="ranking-entry">{render(row)}</span></li>)}</ol>}
  </section>
}
