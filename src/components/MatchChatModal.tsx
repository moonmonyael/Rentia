import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  Lock, 
  ShieldCheck, 
  Clock, 
  Building, 
  MessageSquare, 
  CheckCheck,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { MatchResult, ChatMessage, TenantProfile } from '../types';
import { api } from '../api/client';
import { Language, TRANSLATIONS } from '../i18n/translations';

interface MatchChatModalProps {
  match: MatchResult;
  currentUserId: string;
  isLandlord: boolean;
  tenantProfile?: TenantProfile;
  language: Language;
  onClose: () => void;
  onMatchUpdated?: (updatedMatch: MatchResult) => void;
}

export const MatchChatModal: React.FC<MatchChatModalProps> = ({
  match,
  currentUserId,
  isLandlord,
  tenantProfile,
  language,
  onClose,
  onMatchUpdated,
}) => {
  const t = TRANSLATIONS[language];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [landlordFirstMessageSent, setLandlordFirstMessageSent] = useState(
    match.landlord_first_message_sent
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const res = await api.matching.getMessages(match.id);
      setMessages(res.messages || []);
      setLandlordFirstMessageSent(res.landlord_first_message_sent);
      setErrorMessage(null);
    } catch (err: any) {
      console.error('Erreur chargement messages:', err);
      if (isInitial) setMessages([]);
    } finally {
      if (isInitial) {
        setLoading(false);
        setTimeout(scrollToBottom, 100);
      }
    }
  };

  useEffect(() => {
    fetchMessages(true);

    // Polling toutes les 6 secondes avec suspension si l'onglet est en arrière-plan
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchMessages(false);
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [match.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // RÈGLE MÉTIER STRICTE :
  // Le locataire ne peut pas envoyer de message tant que le propriétaire n'a pas envoyé le 1er message.
  const isInputDisabled = !isLandlord && !landlordFirstMessageSent;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending || isInputDisabled) return;

    const messageContent = inputText.trim();
    setInputText('');
    setSending(true);
    setErrorMessage(null);

    try {
      const res = await api.matching.sendMessage({
        matchId: match.id,
        content: messageContent,
      });

      if (res.success && res.message) {
        setMessages((prev) => [...prev, res.message]);
        if (res.landlord_first_message_sent && !landlordFirstMessageSent) {
          setLandlordFirstMessageSent(true);
          if (onMatchUpdated) {
            onMatchUpdated({
              ...match,
              landlord_first_message_sent: true,
            });
          }
        }
      }
    } catch (err: any) {
      console.error('Erreur envoi message:', err);
      setErrorMessage(err.message || 'Impossible d\'envoyer le message.');
      setInputText(messageContent); // Restaurer le texte
    } finally {
      setSending(false);
    }
  };

  const interlocutorName = isLandlord
    ? match.tenant?.name || 'Locataire'
    : match.landlord?.name || 'Propriétaire certifié';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-[#FAF9F6] w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 flex flex-col h-[640px] max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-stone-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 font-bold text-base shadow-2xs overflow-hidden">
                {isLandlord && match.tenant?.avatar_url ? (
                  <img 
                    src={match.tenant.avatar_url} 
                    alt={interlocutorName} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  interlocutorName.charAt(0).toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-900 text-sm">{interlocutorName}</h3>
                <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[10px] font-semibold">
                  {isLandlord ? t.tenantTag : t.landlordTag}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                <Building className="w-3 h-3 text-amber-700" />
                <span className="truncate max-w-[220px]">
                  {match.listing?.title || match.listing_id}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            title={t.closeChatBtn}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security & Verification Banner */}
        <div className="px-4 py-2 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Match bilatéral certifié par Rentia</span>
          </div>
          <span className="text-[10.5px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
            {match.compatibility_score}% compatibilité
          </span>
        </div>

        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF9F6]">
          {loading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 text-xs gap-2">
              <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              <span>Chargement de la conversation sécurisée...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100/70 text-amber-800 flex items-center justify-center mb-3 shadow-2xs">
                <Sparkles className="w-6 h-6" />
              </div>
              
              {/* État conditionnel selon le rôle de l'utilisateur */}
              {isLandlord ? (
                <div className="max-w-xs space-y-1">
                  <h4 className="font-bold text-stone-800 text-xs">
                    {t.landlordInitiatePrompt}
                  </h4>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    {t.landlordInitiatePromptSubtext}
                  </p>
                </div>
              ) : (
                <div className="max-w-xs space-y-1">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px] mb-1">
                    <Lock className="w-3 h-3 text-amber-700" />
                    <span>{t.waitingLandlordFirstMessage}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    {t.waitingLandlordFirstMessageSubtext}
                  </p>
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId || (isLandlord && msg.sender_role === 'landlord') || (!isLandlord && msg.sender_role === 'tenant');
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-end gap-1.5 max-w-[82%]">
                    {!isMe && (
                      <span className="text-[10px] font-bold text-stone-400 mb-1">
                        {msg.sender_role === 'landlord' ? t.landlordTag : t.tenantTag}
                      </span>
                    )}
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                        isMe
                          ? 'bg-[#1E1B4B] text-white rounded-br-xs'
                          : 'bg-white text-stone-800 border border-stone-200/80 rounded-bl-xs'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[9.5px] text-stone-400 mt-1 px-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isMe && <CheckCheck className="w-3 h-3 text-amber-500 ml-0.5" />}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mx-4 mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Locataire bloqué en attente du 1er message du bailleur */}
        {isInputDisabled && (
          <div className="px-4 py-2.5 bg-amber-50/80 border-t border-amber-200/60 flex items-center gap-2 text-xs text-amber-900">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <div className="text-[11px] leading-tight">
              <span className="font-bold">{t.waitingLandlordFirstMessage} : </span>
              <span>{t.waitingLandlordFirstMessageSubtext}</span>
            </div>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 bg-white border-t border-stone-200 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isInputDisabled || sending}
              placeholder={
                isInputDisabled
                  ? t.typeMessageWaitingPlaceholder
                  : t.typeMessagePlaceholder
              }
              className={`w-full px-4 py-2.5 rounded-xl text-xs transition-all outline-hidden border ${
                isInputDisabled
                  ? 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed italic'
                  : 'bg-stone-50 border-stone-200 text-stone-800 focus:border-amber-600 focus:bg-white'
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={isInputDisabled || sending || !inputText.trim()}
            className={`p-2.5 rounded-xl text-white font-bold transition-all shadow-2xs flex items-center justify-center ${
              isInputDisabled || sending || !inputText.trim()
                ? 'bg-stone-300 text-stone-500 cursor-not-allowed opacity-60'
                : 'bg-amber-600 hover:bg-amber-700 active:scale-95'
            }`}
            title={t.sendBtn}
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
