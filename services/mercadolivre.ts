
import { BACKEND_URL } from '../constants';
import { NotificationType, Product, MercadoLivreTokenResponse } from '../types';

type SetNotificationCallback = (message: string, type: NotificationType) => void;

export class MercadoLivreAPI {
  private clientId: string;
  private accessToken: string | null;
  private refreshToken: string | null;
  private userId: string | null;
  private setNotification: SetNotificationCallback;

  constructor(clientId: string, setNotification: SetNotificationCallback) {
    this.clientId = clientId;
    this.setNotification = setNotification;
    this.accessToken = localStorage.getItem('ml_access_token');
    this.refreshToken = localStorage.getItem('ml_refresh_token');
    this.userId = localStorage.getItem('ml_user_id');
    console.log("[API Constructor] Client ID recebido:", clientId);
  }

  public isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  private buildFallbackUri(origin: string, pathname: string): string {
    console.warn("[API getRedirectUri] Usando estratégia de fallback para URI (origin + pathname).");
    if (window.location.protocol === 'blob:') { 
        return "COPIE_A_URL_HTTPS_DA_SUA_APLICACAO_GEMINI_AQUI_FALLBACK_BLOB";
    }
    // Para localhost ou casos gerais, origin + pathname geralmente está correto.
    // Garante que o pathname comece com uma barra se não estiver vazio.
    let correctedPathname = pathname;
    if (!correctedPathname.startsWith('/') && correctedPathname !== "") {
        correctedPathname = '/' + correctedPathname;
    }
    // Evita barras duplas entre a origem e o caminho se o caminho for "/"
    if (origin.endsWith('/') && correctedPathname.startsWith('/')) {
        return origin + correctedPathname.substring(1);
    }
    return origin + correctedPathname;
  }

  public getRedirectUri(): string {
    const currentPathname = window.location.pathname;
    const currentOrigin = window.location.origin;
    let generatedUri = '';

    console.log("[API getRedirectUri] Raw - window.location.origin:", currentOrigin);
    console.log("[API getRedirectUri] Raw - window.location.pathname:", currentPathname);
    
    if (currentOrigin && typeof currentOrigin === 'string' && currentOrigin.includes('scf.usercontent.goog')) {
        console.log("[API getRedirectUri] Detectado scf.usercontent.goog origin. Usando origin + '/' como URI base.");
        generatedUri = currentOrigin + '/'; 
    }
    else if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
        console.log("[API getRedirectUri] Tentando ancestorOrigins.");
        let scfOriginFromAncestor = null;
        for (let i = 0; i < window.location.ancestorOrigins.length; i++) {
            if (typeof window.location.ancestorOrigins[i] === 'string' && window.location.ancestorOrigins[i].includes('scf.usercontent.goog')) {
                scfOriginFromAncestor = window.location.ancestorOrigins[i];
                break; 
            }
        }
        if (scfOriginFromAncestor) {
            console.log("[API getRedirectUri] Encontrado scfOrigin em ancestorOrigins. Usando ancestor origin + '/' como URI base:", scfOriginFromAncestor);
            generatedUri = scfOriginFromAncestor + '/';
        } else {
            console.warn("[API getRedirectUri] 'scf.usercontent.goog' não encontrado em ancestorOrigins. Usando fallback com origin e pathname atuais.");
            generatedUri = this.buildFallbackUri(currentOrigin, currentPathname);
        }
    }
    else {
        console.warn("[API getRedirectUri] Nenhuma estratégia primária (origem direta ou ancestor) funcionou. Usando fallback com origin e pathname atuais.");
        generatedUri = this.buildFallbackUri(currentOrigin, currentPathname);
    }

    if (generatedUri.startsWith('http://localhost')) {
        // Mantém http para localhost
    } else if (generatedUri.startsWith('http:')) {
        generatedUri = 'https:' + generatedUri.substring(5);
    }

    if (generatedUri && !generatedUri.includes("COPIE_A_URL")) {
        try {
            const urlObj = new URL(generatedUri);
            urlObj.pathname = urlObj.pathname.replace(/\/\/+/g, '/');
            generatedUri = urlObj.toString();
            
            if (urlObj.pathname === '/' && !generatedUri.endsWith('/')) {
                generatedUri += '/';
            }
        } catch (e) {
            console.warn("[API getRedirectUri] Não foi possível normalizar URI com construtor URL (provavelmente um placeholder):", generatedUri, e);
            generatedUri = generatedUri.replace(/([^:]\/)\/+/g, "$1"); 
        }
    }
    
    console.log("[API getRedirectUri] URI de Redirecionamento Final:", generatedUri);
    return generatedUri;
  }

  public authenticate(): void {
    if (!this.clientId) {
      console.error("[API Authenticate] ERRO: Client ID está em falta ou é inválido na instância da API.");
      this.setNotification("Client ID em falta na API. Verifique a configuração.", NotificationType.ERROR);
      return;
    }
    const redirectUri = this.getRedirectUri();

    if (redirectUri.includes("COPIE_A_URL") || redirectUri.includes("ERRO_COPIE_A_URL")) {
        this.setNotification("ERRO CRÍTICO: A URI de redirecionamento não pôde ser determinada automaticamente. Verifique a consola e configure a URL correta no Mercado Livre.", NotificationType.ERROR);
        console.error(`[API Authenticate] A URI de redirecionamento gerada é inválida: ${redirectUri}. Configure-a manualmente no Mercado Livre.`);
        return;
    }

    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log("[API Authenticate] A tentar redirecionar para URL de autenticação:", authUrl);
    this.setNotification('A redirecionar para o Mercado Livre para autorização...', NotificationType.INFO);
    
    // Alteração: Redirecionar a janela atual em vez de abrir um pop-up
    try {
      window.location.href = authUrl;
    } catch (error: any) {
        // Este catch é mais por precaução, window.location.href raramente lança exceções diretas
        // que podem ser capturadas desta forma, a menos que seja um erro de sintaxe muito específico
        // ou uma política de segurança extremamente restritiva (improvável para redirecionamentos simples).
        console.error("[API Authenticate] Erro ao tentar redirecionar a página:", error);
        this.setNotification(`Erro ao tentar iniciar autenticação: ${error.message || 'Erro desconhecido'}. Tente novamente.`, NotificationType.ERROR);
    }
  }

  public async handleCallback(code: string): Promise<boolean> {
    try {
      const redirectUri = this.getRedirectUri();
      console.log("[Frontend] A enviar código para o backend:", code, "com redirect_uri:", redirectUri);
      
      if (redirectUri.includes("COPIE_A_URL") || redirectUri.includes("ERRO_COPIE_A_URL")) {
        this.setNotification("ERRO CRÍTICO no callback: A URI de redirecionamento é inválida. A autenticação falhará.", NotificationType.ERROR);
        console.error(`[API handleCallback] A URI de redirecionamento gerada é inválida: ${redirectUri}.`);
        return false;
      }

      const response = await fetch(`${BACKEND_URL}/api/mercadolivre/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });

      const data: MercadoLivreTokenResponse = await response.json();
      console.log("[Frontend] Resposta do backend (handleCallback):", data);

      if (response.ok && data.access_token) {
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.userId = String(data.user_id);

        localStorage.setItem('ml_access_token', this.accessToken);
        localStorage.setItem('ml_refresh_token', this.refreshToken);
        localStorage.setItem('ml_user_id', String(this.userId));
        this.setNotification('Conectado com sucesso ao Mercado Livre!', NotificationType.SUCCESS);
        return true;
      } else {
        const errorMsg = data.details?.error_description || data.error || data.message || 'Falha na autenticação via backend.';
        console.error('Erro na autenticação via backend:', data);
        this.setNotification(`Erro de autenticação: ${errorMsg}`, NotificationType.ERROR);
        return false;
      }
    } catch (error: any) {
      console.error('Erro na comunicação com o backend (handleCallback):', error);
      this.setNotification(`Erro de comunicação: ${error.message}`, NotificationType.ERROR);
      return false;
    }
  }

  public async refreshTokenFlow(): Promise<boolean> {
    if (!this.refreshToken) {
      this.setNotification("Sessão expirada. Refresh token não encontrado.", NotificationType.ERROR);
      this.logout();
      return false;
    }
    console.log("[Frontend] Tentando atualizar token...");
    try {
      const redirectUri = this.getRedirectUri();
      if (redirectUri.includes("COPIE_A_URL") || redirectUri.includes("ERRO_COPIE_A_URL")) {
        this.setNotification("ERRO CRÍTICO no refresh: A URI de redirecionamento é inválida.", NotificationType.ERROR);
        this.logout();
        return false;
      }

      const response = await fetch(`${BACKEND_URL}/api/mercadolivre/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.clientId, 
          redirect_uri: redirectUri 
        }),
      });
      const data: MercadoLivreTokenResponse = await response.json();
      console.log("[Frontend] Resposta do backend (refreshTokenFlow):", data);

      if (response.ok && data.access_token) {
        this.accessToken = data.access_token;
        if (data.refresh_token) this.refreshToken = data.refresh_token; 
        this.userId = String(data.user_id);

        localStorage.setItem('ml_access_token', this.accessToken);
        if (data.refresh_token) localStorage.setItem('ml_refresh_token', this.refreshToken);
        localStorage.setItem('ml_user_id', String(this.userId));
        this.setNotification('Sessão atualizada com sucesso.', NotificationType.SUCCESS);
        return true;
      } else {
        const errorMsg = data.details?.error_description || data.error || data.message || 'Falha ao atualizar token.';
        this.setNotification(`Erro ao atualizar sessão: ${errorMsg}. Por favor, conecte-se novamente.`, NotificationType.ERROR);
        this.logout();
        return false;
      }
    } catch (error: any) {
      this.setNotification(`Erro na atualização da sessão: ${error.message}`, NotificationType.ERROR);
      this.logout();
      return false;
    }
  }

  private async makeRequest<T,>(url: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      this.setNotification('Token de acesso não disponível. Tente reconectar.', NotificationType.ERROR);
      throw new Error('Token de acesso não disponível.');
    }
    try {
      let response = await fetch(url, {
        ...options,
        headers: { ...options.headers, 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json' },
      });

      if (response.status === 401) { 
        this.setNotification('Sessão expirada. Tentando renovar...', NotificationType.INFO);
        const refreshed = await this.refreshTokenFlow();
        if (refreshed) {
          response = await fetch(url, { 
            ...options,
            headers: { ...options.headers, 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json' },
          });
        } else {
          throw new Error('Falha ao atualizar token. Faça login novamente.');
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP ${response.status}` }));
        const errorMsg = errorData.message || JSON.stringify(errorData);
        throw new Error(errorMsg);
      }
      return await response.json() as T;
    } catch (error: any) {
      console.error(`Erro em makeRequest para ${url}:`, error);
      throw error;
    }
  }

  public async getMyProducts(): Promise<Product[]> {
    if (!this.userId) {
        this.setNotification("User ID não encontrado. Tentando renovar sessão...", NotificationType.INFO);
        const refreshed = await this.refreshTokenFlow();
        if (!refreshed || !this.userId) {
            this.setNotification("Não foi possível obter User ID. Por favor, reconecte.", NotificationType.ERROR);
            return [];
        }
    }
    try {
      const itemsResponse = await this.makeRequest<{ results: string[] }>(`https://api.mercadolibre.com/users/${this.userId}/items/search?limit=50&orders=start_time_desc`);
      const itemIds = itemsResponse.results || [];
      if (itemIds.length === 0) return [];

      const limitedIds = itemIds.slice(0, 15); 
      
      const productsPromises = limitedIds.map(async (itemId) => {
        try {
          const item = await this.makeRequest<any>(`https://api.mercadolibre.com/items/${itemId}`);
          return {
            id: item.id,
            title: item.title,
            price: item.price,
            currentStock: item.available_quantity,
            thumbnail: item.thumbnail || `https://http2.mlstatic.com/D_NQ_NP_${item.id}-F.jpg`,
            category: item.category_id,
            status: item.status,
            condition: item.condition,
            sold_quantity: item.sold_quantity || 0,
            avgDailySales: Math.max(0.05, (item.sold_quantity || 0) / (item.status === 'active' ? 30 : 90)),
            minStock: Math.max(1, Math.ceil((item.sold_quantity || 0) / 30 * 7)), 
            lastRestock: new Date().toISOString().split('T')[0], 
          };
        } catch (error: any) {
          console.error(`Erro ao buscar detalhes do produto ${itemId}:`, error.message);
          return null; 
        }
      });

      const products = (await Promise.all(productsPromises)).filter(product => product !== null) as Product[];
      if (products.length === 0 && itemIds.length > 0) {
         this.setNotification('Não foi possível carregar detalhes dos produtos. Alguns pedidos podem ter falhado.', NotificationType.ERROR);
      }
      return products;
    } catch (error: any) {
      this.setNotification(`Erro geral ao buscar produtos: ${error.message}.`, NotificationType.ERROR);
      return [];
    }
  }

  public logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.userId = null;
    localStorage.removeItem('ml_access_token');
    localStorage.removeItem('ml_refresh_token');
    localStorage.removeItem('ml_user_id');
  }

  public getInternalClientId(): string | null { 
    return this.clientId;
  }
}
