import React, { useState, useEffect } from 'react';
import { 
  ChakraProvider, 
  Box, 
  useColorMode, 
  IconButton,
  Flex,
  Text,
  ButtonGroup,
  Button,
  Container,
  Link,
  Icon,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import { FiHome, FiActivity, FiBook, FiFileText, FiMapPin } from 'react-icons/fi';
import theme from './theme';

// Import components and pages
import Dashboard from './pages/Dashboard';
import SimulationPage from './pages/SimulationPage';
import CompendiumPage from './pages/CompendiumPage';
import PapersPage from './pages/PapersPage';
import TopicDetailPage from './pages/TopicDetailPage';
import LearningPathPage from './pages/LearningPathPage';

// Theme toggle component
const ThemeToggle = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  
  return (
    <IconButton
      aria-label={`Switch to ${colorMode === 'light' ? 'dark' : 'light'} mode`}
      icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
      onClick={toggleColorMode}
      size="md"
      variant="ghost"
      colorScheme="blue"
      position="fixed"
      top="4"
      right="4"
      zIndex="docked"
    />
  );
};

// Navigation header component
const Navigation = ({ activeTab, setActiveTab }: { 
  activeTab: number, 
  setActiveTab: (index: number) => void 
}) => {
  const { colorMode } = useColorMode();
  
  return (
    <Flex
      as="nav"
      align="center"
      justify="space-between"
      wrap="wrap"
      w="100%"
      p={4}
      bg={colorMode === 'light' ? 'white' : 'gray.800'}
      color={colorMode === 'light' ? 'gray.800' : 'white'}
      borderBottomWidth="1px"
      borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
      position="sticky"
      top={0}
      zIndex="sticky"
    >
      <Flex align="center">
        <Text
          fontSize="xl"
          fontWeight="bold"
          bgGradient="linear(to-r, blue.500, teal.500)"
          bgClip="text"
        >
          FedCompendium XL
        </Text>
      </Flex>

      <ButtonGroup variant="ghost" spacing={2}>
        <Button 
          leftIcon={<Icon as={FiHome as React.ElementType} />}
          onClick={() => {
            setActiveTab(0);
            window.history.pushState(null, "", "/");
          }}
          colorScheme={activeTab === 0 ? "blue" : undefined}
          size="sm"
        >
          Dashboard
        </Button>
        <Button 
          leftIcon={<Icon as={FiActivity as React.ElementType} />}
          onClick={() => {
            setActiveTab(1);
            window.history.pushState(null, "", "/simulation");
          }}
          colorScheme={activeTab === 1 ? "blue" : undefined}
          size="sm"
        >
          Simulation
        </Button>
        <Button 
          leftIcon={<Icon as={FiBook as React.ElementType} />}
          onClick={() => {
            setActiveTab(2);
            window.history.pushState(null, "", "/compendium");
          }}
          colorScheme={activeTab === 2 ? "blue" : undefined}
          size="sm"
        >
          Compendium
        </Button>
        <Button 
          leftIcon={<Icon as={FiFileText as React.ElementType} />}
          onClick={() => {
            setActiveTab(3);
            window.history.pushState(null, "", "/papers");
          }}
          colorScheme={activeTab === 3 ? "blue" : undefined}
          size="sm"
        >
          Papers
        </Button>
        <Button 
          leftIcon={<Icon as={FiMapPin as React.ElementType} />}
          onClick={() => {
            setActiveTab(4);
            window.history.pushState(null, "", "/learning-path");
          }}
          colorScheme={activeTab === 4 ? "blue" : undefined}
          size="sm"
        >
          Learning Path
        </Button>
      </ButtonGroup>
    </Flex>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [learningPathId, setLearningPathId] = useState<string | null>(null);
  
  // Controlla l'URL al caricamento della pagina per determinare quale tab mostrare
  useEffect(() => {
    const path = window.location.pathname;
    
    // Se è un URL di topic, estrai l'ID e imposta lo stato
    if (path.startsWith('/topic/')) {
      const id = path.split('/').pop() || '';
      setTopicId(id);
      setActiveTab(-1); // Usa un valore speciale per indicare la pagina del topic
    }
    // Se è un URL di learning path detail, estrai l'ID e imposta lo stato
    else if (path.startsWith('/learning-path/')) {
      const id = path.split('/').pop() || '';
      setLearningPathId(id);
      setActiveTab(4);
    }
    // Altrimenti, imposta il tab in base al percorso
    else if (path.includes('simulation')) {
      setActiveTab(1);
    } else if (path.includes('compendium')) {
      setActiveTab(2);
    } else if (path.includes('papers')) {
      setActiveTab(3);
    } else if (path.includes('learning-path')) {
      setActiveTab(4);
    } else {
      setActiveTab(0); // Dashboard come default
    }
  }, []);
  
  const handleViewCompendium = () => {
    setActiveTab(2);
    window.history.pushState(null, "", "/compendium");
  };
  
  const handleViewPapers = () => {
    setActiveTab(3);
    window.history.pushState(null, "", "/papers");
  };
  
  const handleViewSimulation = () => {
    setActiveTab(1);
    window.history.pushState(null, "", "/simulation");
  };

  const handleBackToCompendium = () => {
    setActiveTab(2);
    setTopicId(null);
    window.history.pushState(null, "", "/compendium");
  };

  const handleViewLearningPath = () => {
    setActiveTab(4);
    window.history.pushState(null, "", "/learning-path");
  };
  
  return (
    <ChakraProvider theme={theme}>
      <Box minH="100vh" bg="gray.50" _dark={{ bg: "gray.900" }}>
        <ThemeToggle />
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <Box pt={2}>
          {activeTab === 0 && (
            <Dashboard 
              onViewCompendium={handleViewCompendium}
              onViewPapers={handleViewPapers}
              onStartSimulation={handleViewSimulation}
            />
          )}
          
          {activeTab === 1 && (
            <SimulationPage />
          )}
          
          {activeTab === 2 && (
            <CompendiumPage onViewLearningPath={handleViewLearningPath} />
          )}
          
          {activeTab === 3 && (
            <PapersPage />
          )}

          {activeTab === 4 && (
            <LearningPathPage />
          )}

          {/* Mostra il TopicDetailPage quando activeTab è -1 */}
          {activeTab === -1 && topicId && (
            <TopicDetailPage 
              topicId={topicId} 
              onBackToCompendium={handleBackToCompendium}
            />
          )}
        </Box>
        
        <Box 
          as="footer" 
          py={4} 
          textAlign="center"
          borderTopWidth="1px"
          borderColor="gray.200"
          _dark={{ borderColor: "gray.700" }}
          mt={8}
        >
          <Container maxW="container.xl">
            <Text fontSize="sm" color="gray.500">
              © 2024 FedCompendium XL | 
              <Link href="#" ml={1} mr={1} color="blue.500">Documentation</Link> |
              <Link href="#" ml={1} color="blue.500">GitHub</Link>
            </Text>
          </Container>
        </Box>
      </Box>
    </ChakraProvider>
  );
}

export default App;