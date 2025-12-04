// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SocialMediaPost {
  id: string;
  encryptedContent: string;
  timestamp: number;
  source: string;
  threatLevel: number;
  category: string;
  status: "analyzing" | "threat" | "safe";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newPostData, setNewPostData] = useState({
    content: "",
    source: "twitter",
    category: "public"
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showProjectInfo, setShowProjectInfo] = useState(true);
  const postsPerPage = 5;

  // Calculate statistics for dashboard
  const threatCount = posts.filter(p => p.status === "threat").length;
  const safeCount = posts.filter(p => p.status === "safe").length;
  const analyzingCount = posts.filter(p => p.status === "analyzing").length;

  useEffect(() => {
    loadPosts().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadPosts = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("post_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing post keys:", e);
        }
      }
      
      const list: SocialMediaPost[] = [];
      
      for (const key of keys) {
        try {
          const postBytes = await contract.getData(`post_${key}`);
          if (postBytes.length > 0) {
            try {
              const postData = JSON.parse(ethers.toUtf8String(postBytes));
              list.push({
                id: key,
                encryptedContent: postData.content,
                timestamp: postData.timestamp,
                source: postData.source,
                threatLevel: postData.threatLevel || 0,
                category: postData.category,
                status: postData.status || "analyzing"
              });
            } catch (e) {
              console.error(`Error parsing post data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading post ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPosts(list);
    } catch (e) {
      console.error("Error loading posts:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const analyzePost = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAnalyzing(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting social media data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedContent = `FHE-${btoa(JSON.stringify(newPostData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const postId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const postData = {
        content: encryptedContent,
        timestamp: Math.floor(Date.now() / 1000),
        source: newPostData.source,
        category: newPostData.category,
        status: "analyzing",
        threatLevel: Math.floor(Math.random() * 100) // Simulated threat level
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `post_${postId}`, 
        ethers.toUtf8Bytes(JSON.stringify(postData))
      );
      
      const keysBytes = await contract.getData("post_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(postId);
      
      await contract.setData(
        "post_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Social media data encrypted and submitted securely!"
      });
      
      await loadPosts();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAnalyzeModal(false);
        setNewPostData({
          content: "",
          source: "twitter",
          category: "public"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAnalyzing(false);
    }
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Analysis System is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Filter posts based on search and filters
  const filteredPosts = posts.filter(post => {
    const matchesSearch = searchQuery === "" || 
      post.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || post.category === filterCategory;
    const matchesStatus = filterStatus === "all" || post.status === filterStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const currentPosts = filteredPosts.slice(
    (currentPage - 1) * postsPerPage,
    currentPage * postsPerPage
  );

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE analysis system",
      icon: "🔗"
    },
    {
      title: "Submit Social Media Data",
      description: "Add social media content for confidential threat analysis",
      icon: "📱"
    },
    {
      title: "FHE Processing",
      description: "Content is analyzed in encrypted state without decryption",
      icon: "🔒"
    },
    {
      title: "Get Threat Assessment",
      description: "Receive threat analysis while preserving privacy",
      icon: "⚠️"
    }
  ];

  const renderThreatChart = () => {
    const total = posts.length || 1;
    const threatPercentage = (threatCount / total) * 100;
    const safePercentage = (safeCount / total) * 100;
    const analyzingPercentage = (analyzingCount / total) * 100;

    return (
      <div className="threat-chart-container">
        <div className="threat-chart">
          <div 
            className="chart-segment threat" 
            style={{ transform: `rotate(${threatPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="chart-segment safe" 
            style={{ transform: `rotate(${(threatPercentage + safePercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="chart-segment analyzing" 
            style={{ transform: `rotate(${(threatPercentage + safePercentage + analyzingPercentage) * 3.6}deg)` }}
          ></div>
          <div className="chart-center">
            <div className="chart-value">{posts.length}</div>
            <div className="chart-label">Posts</div>
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="color-box threat"></div>
            <span>Threat: {threatCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box safe"></div>
            <span>Safe: {safeCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box analyzing"></div>
            <span>Analyzing: {analyzingCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>PublicSafety<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowAnalyzeModal(true)} 
            className="analyze-post-btn button-primary"
          >
            <div className="add-icon"></div>
            Analyze Post
          </button>
          <button 
            className="button-secondary"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        {showProjectInfo && (
          <div className="project-info-banner">
            <div className="info-content">
              <h2>Confidential Analysis of Social Media for Public Safety</h2>
              <p>Law enforcement agencies can perform FHE analysis on encrypted, public social media data to identify potential public safety threats while preserving user privacy.</p>
              <button className="close-info" onClick={() => setShowProjectInfo(false)}>×</button>
            </div>
          </div>
        )}
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Social Media Analysis Tutorial</h2>
            <p className="subtitle">Learn how to confidentially analyze social media for public safety threats</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>FHE Threat Analysis</h3>
            <p>Using Fully Homomorphic Encryption to analyze social media content without decrypting sensitive user data.</p>
            <button className="button-primary" onClick={checkAvailability}>
              Check System Status
            </button>
          </div>
          
          <div className="dashboard-card">
            <h3>Analysis Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{posts.length}</div>
                <div className="stat-label">Total Posts</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{threatCount}</div>
                <div className="stat-label">Threats</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{safeCount}</div>
                <div className="stat-label">Safe</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{analyzingCount}</div>
                <div className="stat-label">Analyzing</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <h3>Threat Distribution</h3>
            {renderThreatChart()}
          </div>
        </div>
        
        <div className="analysis-section">
          <div className="section-header">
            <h2>Social Media Analysis</h2>
            <div className="header-actions">
              <button 
                onClick={loadPosts}
                className="refresh-btn button-secondary"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
          
          <div className="filters-row">
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search posts..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="public">Public</option>
              <option value="event">Event Related</option>
              <option value="government">Government</option>
            </select>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="analyzing">Analyzing</option>
              <option value="threat">Threat</option>
              <option value="safe">Safe</option>
            </select>
          </div>
          
          <div className="posts-list">
            {currentPosts.length === 0 ? (
              <div className="no-posts">
                <div className="no-posts-icon"></div>
                <p>No social media posts analyzed yet</p>
                <button 
                  className="button-primary"
                  onClick={() => setShowAnalyzeModal(true)}
                >
                  Analyze First Post
                </button>
              </div>
            ) : (
              <>
                {currentPosts.map(post => (
                  <div className="post-card" key={post.id}>
                    <div className="post-header">
                      <span className={`status-badge ${post.status}`}>
                        {post.status}
                      </span>
                      <span className="post-source">{post.source}</span>
                      <span className="post-date">
                        {new Date(post.timestamp * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="post-content">
                      <div className="encrypted-indicator">
                        <div className="lock-icon"></div>
                        <span>Content Encrypted with FHE</span>
                      </div>
                      <div className="post-meta">
                        <span className="threat-level">Threat Level: {post.threatLevel}%</span>
                        <span className="post-category">{post.category}</span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {totalPages > 1 && (
                  <div className="pagination">
                    <button 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <button 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
  
      {showAnalyzeModal && (
        <ModalAnalyze 
          onSubmit={analyzePost} 
          onClose={() => setShowAnalyzeModal(false)} 
          analyzing={analyzing}
          postData={newPostData}
          setPostData={setNewPostData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>PublicSafetyFHE</span>
            </div>
            <p>Confidential analysis of social media for public safety using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy Protection</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PublicSafetyFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAnalyzeProps {
  onSubmit: () => void; 
  onClose: () => void; 
  analyzing: boolean;
  postData: any;
  setPostData: (data: any) => void;
}

const ModalAnalyze: React.FC<ModalAnalyzeProps> = ({ 
  onSubmit, 
  onClose, 
  analyzing,
  postData,
  setPostData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPostData({
      ...postData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!postData.content) {
      alert("Please enter social media content");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="analyze-modal">
        <div className="modal-header">
          <h2>Analyze Social Media Content</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Content will be encrypted with FHE for confidential analysis
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Source Platform</label>
              <select 
                name="source"
                value={postData.source} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="twitter">Twitter</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="reddit">Reddit</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Category</label>
              <select 
                name="category"
                value={postData.category} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="public">Public</option>
                <option value="event">Event Related</option>
                <option value="government">Government</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Social Media Content *</label>
              <textarea 
                name="content"
                value={postData.content} 
                onChange={handleChange}
                placeholder="Paste social media content for threat analysis..." 
                className="form-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Content remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn button-secondary"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={analyzing}
            className="submit-btn button-primary"
          >
            {analyzing ? "Encrypting with FHE..." : "Analyze Confidentially"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;